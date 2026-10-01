// MerchantEye AI — in-browser vision engine
// YOLOv8n (ONNX) person detection  ->  IoU tracker (one ID per person)
// -> queue zone (ROI)  ->  waiting time = time each tracked ID stays inside the zone.
// Runs entirely in the viewer's browser with onnxruntime-web (no server, no upload).

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Zone = { x1: number; y1: number; x2: number; y2: number }; // normalized 0..1

export type Detection = { x1: number; y1: number; x2: number; y2: number; conf: number };

export type TrackState = {
  id: number;
  box: Detection;            // in video pixels
  kind: "customer" | "queue" | "staff";
  waitSec: number;
  conf: number;
  t: number;                 // video time of this detection
  vx: number; vy: number;    // estimated motion (px / s), used to keep boxes on people between frames
};

export type FrameStats = {
  t: number;                 // video time (s)
  visitorsNow: number;
  queueCount: number;
  staffCount: number;
  avgWaitSec: number;
  maxWaitSec: number;
  cxScore: number;
  level: "ok" | "warning" | "alert";
  insightAr: string;
  insightEn: string;
  inferenceMs: number;
};

export type EngineSettings = {
  conf: number;              // detection confidence threshold
  waitThresholdSec: number;  // alert when a wait exceeds this
  queueLimit: number;        // alert when the queue reaches this length
};

const MODEL_URL = "/models/yolov8n-480.onnx";
const ORT_URL = "/ort/ort.wasm.min.js";
const INPUT = 480;
const NUM_ANCHORS = (INPUT / 8) ** 2 + (INPUT / 16) ** 2 + (INPUT / 32) ** 2; // 4725

// ---------------------------------------------------------------- runtime loading

let ortPromise: Promise<any> | null = null;
function loadOrt(): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  const w = window as any;
  if (w.ort) return Promise.resolve(w.ort);
  if (!ortPromise) {
    ortPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = ORT_URL;
      s.async = true;
      s.onload = () => (w.ort ? resolve(w.ort) : reject(new Error("ort failed to load")));
      s.onerror = () => reject(new Error("could not load " + ORT_URL));
      document.head.appendChild(s);
    });
  }
  return ortPromise;
}

let sessionPromise: Promise<any> | null = null;
const progressListeners = new Set<(pct: number) => void>();

async function fetchWithProgress(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const total = Number(res.headers.get("content-length")) || 12_800_000;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    const pct = Math.min(99, Math.round((got / total) * 100));
    progressListeners.forEach((f) => f(pct));
  }
  const out = new Uint8Array(got);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/** Load the model (once). `onProgress` receives the download percentage 0-100. */
export function loadModel(onProgress?: (pct: number) => void): Promise<any> {
  if (onProgress) progressListeners.add(onProgress);
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const [ort, bytes] = await Promise.all([loadOrt(), fetchWithProgress(MODEL_URL)]);
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = (window as any).crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
      progressListeners.forEach((f) => f(100));
      return session;
    })();
    sessionPromise.catch(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

// ---------------------------------------------------------------- detection

const prepCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

export async function detectPeople(video: HTMLVideoElement, confThr: number): Promise<{ dets: Detection[]; ms: number }> {
  const session = await loadModel();
  const ort = (window as any).ort;
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !prepCanvas) return { dets: [], ms: 0 };

  // letterbox into INPUT x INPUT
  const scale = Math.min(INPUT / vw, INPUT / vh);
  const nw = Math.round(vw * scale), nh = Math.round(vh * scale);
  const padX = Math.floor((INPUT - nw) / 2), padY = Math.floor((INPUT - nh) / 2);
  prepCanvas.width = INPUT; prepCanvas.height = INPUT;
  const ctx = prepCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, INPUT, INPUT);
  ctx.drawImage(video, padX, padY, nw, nh);
  const px = ctx.getImageData(0, 0, INPUT, INPUT).data;

  const area = INPUT * INPUT;
  const input = new Float32Array(3 * area);
  for (let i = 0, p = 0; i < area; i++, p += 4) {
    input[i] = px[p] / 255;
    input[i + area] = px[p + 1] / 255;
    input[i + 2 * area] = px[p + 2] / 255;
  }

  const t0 = performance.now();
  const out = await session.run({ images: new ort.Tensor("float32", input, [1, 3, INPUT, INPUT]) });
  const ms = performance.now() - t0;
  const data = out.output0.data as Float32Array; // [1, 84, N]
  const N = NUM_ANCHORS;

  const raw: Detection[] = [];
  for (let i = 0; i < N; i++) {
    const score = data[4 * N + i]; // class 0 = person
    if (score < confThr) continue;
    const cx = data[i], cy = data[N + i], w = data[2 * N + i], h = data[3 * N + i];
    raw.push({
      x1: Math.max(0, (cx - w / 2 - padX) / scale),
      y1: Math.max(0, (cy - h / 2 - padY) / scale),
      x2: Math.min(vw, (cx + w / 2 - padX) / scale),
      y2: Math.min(vh, (cy + h / 2 - padY) / scale),
      conf: score,
    });
  }
  return { dets: nms(raw, 0.5), ms };
}

function iou(a: Detection, b: Detection) {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  const inter = ix * iy;
  const u = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
  return u > 0 ? inter / u : 0;
}

function nms(boxes: Detection[], thr: number): Detection[] {
  boxes.sort((a, b) => b.conf - a.conf);
  const keep: Detection[] = [];
  for (const b of boxes) if (keep.every((k) => iou(k, b) < thr)) keep.push(b);
  return keep;
}

// ---------------------------------------------------------------- tracking + queue logic

type Track = {
  id: number;
  box: Detection;
  vx: number; vy: number;     // velocity of the box centre (px / s)
  lastT: number;
  hits: number;
  staffHits: number;
  queueEnter: number | null;
  queueLastIn: number | null;
};

const fmt = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function cxIndex(avgWait: number, queue: number, threshold: number) {
  const waitPenalty = threshold > 0 ? Math.min(50, 40 * (avgWait / threshold)) : 0;
  const queuePenalty = Math.min(30, Math.max(0, queue - 2) * 6);
  return Math.round(Math.max(0, 100 - waitPenalty - queuePenalty));
}

export function makeInsight(queue: number, avgWait: number, maxWait: number, s: EngineSettings) {
  if (queue >= s.queueLimit || maxWait >= s.waitThresholdSec)
    return { level: "alert" as const,
      ar: `تنبيه: ${queue} أشخاص في الطابور وأطول انتظار ${fmt(maxWait)}. يُنصح بفتح كاشير إضافي فوراً.`,
      en: `Alert: ${queue} people in queue, longest wait ${fmt(maxWait)}. Open an extra checkout now.` };
  if (queue >= Math.max(2, s.queueLimit - 1) || avgWait >= 0.6 * s.waitThresholdSec)
    return { level: "warning" as const,
      ar: `بدأ الطابور يتشكل (${queue} أشخاص، متوسط الانتظار ${fmt(avgWait)}). استعدوا لفتح كاشير إضافي.`,
      en: `Queue building up (${queue} people, avg wait ${fmt(avgWait)}). Prepare an extra checkout.` };
  if (queue === 0)
    return { level: "ok" as const, ar: "لا يوجد طابور حالياً. الحركة انسيابية.", en: "No queue right now. Flow is smooth." };
  return { level: "ok" as const,
    ar: `الحركة طبيعية: ${queue} في الطابور ومتوسط الانتظار ${fmt(avgWait)}.`,
    en: `Normal flow: ${queue} in queue, avg wait ${fmt(avgWait)}.` };
}

export class QueueTracker {
  private tracks: Track[] = [];
  private nextId = 1;
  private everSeen = new Set<number>();
  private completedWaits: number[] = [];
  readonly maxAge = 1.5;        // s a lost track is kept (occlusion)
  readonly grace = 1.5;         // s a person may be missed before leaving the queue
  readonly minWait = 2;         // ignore queue visits shorter than this (passers-by)

  reset() {
    this.tracks = []; this.nextId = 1; this.everSeen.clear(); this.completedWaits = [];
  }

  get uniqueCustomers() { return this.everSeen.size; }
  get finishedWaits() { return [...this.completedWaits]; }

  update(dets: Detection[], t: number, vw: number, vh: number, queue: Zone[], staff: Zone[]): TrackState[] {
    // time went backwards (video looped / seeked) -> start a fresh session
    if (this.tracks.length && t + 0.25 < Math.max(...this.tracks.map((k) => k.lastT))) this.tracks = [];

    // predict positions, then greedy match by IoU (fallback: centre distance)
    const pred = this.tracks.map((k) => {
      const dt = Math.min(1, t - k.lastT);
      return { ...k.box, x1: k.box.x1 + k.vx * dt, x2: k.box.x2 + k.vx * dt, y1: k.box.y1 + k.vy * dt, y2: k.box.y2 + k.vy * dt };
    });
    const pairs: [number, number, number][] = [];
    pred.forEach((p, ti) => dets.forEach((d, di) => {
      const o = iou(p, d);
      const dx = ((p.x1 + p.x2) - (d.x1 + d.x2)) / 2, dy = ((p.y1 + p.y2) - (d.y1 + d.y2)) / 2;
      const size = Math.max(p.x2 - p.x1, p.y2 - p.y1, 1);
      const near = Math.hypot(dx, dy) / size;
      const score = o > 0.1 ? o : near < 0.6 ? 0.1 * (1 - near) : 0;
      if (score > 0) pairs.push([score, ti, di]);
    }));
    pairs.sort((a, b) => b[0] - a[0]);
    const usedT = new Set<number>(), usedD = new Set<number>();
    const assigned = new Map<number, number>(); // det -> track index
    for (const [, ti, di] of pairs) {
      if (usedT.has(ti) || usedD.has(di)) continue;
      usedT.add(ti); usedD.add(di); assigned.set(di, ti);
    }

    const inZone = (zones: Zone[], x: number, y: number) =>
      zones.some((z) => x >= z.x1 * vw && x <= z.x2 * vw && y >= z.y1 * vh && y <= z.y2 * vh);

    const states: TrackState[] = [];
    dets.forEach((d, di) => {
      let k: Track;
      const ti = assigned.get(di);
      if (ti !== undefined) {
        k = this.tracks[ti];
        const dt = Math.max(1e-3, t - k.lastT);
        const cx = (d.x1 + d.x2) / 2 - (k.box.x1 + k.box.x2) / 2, cy = (d.y1 + d.y2) / 2 - (k.box.y1 + k.box.y2) / 2;
        k.vx = 0.6 * k.vx + 0.4 * (cx / dt); k.vy = 0.6 * k.vy + 0.4 * (cy / dt);
        k.box = d; k.lastT = t; k.hits++;
      } else {
        k = { id: this.nextId++, box: d, vx: 0, vy: 0, lastT: t, hits: 1, staffHits: 0, queueEnter: null, queueLastIn: null };
        this.tracks.push(k);
      }
      const fx = (d.x1 + d.x2) / 2, fy = d.y2;   // "feet" point
      // Behind a counter the cashier's feet are usually hidden, so test the body centre too.
      const cy = (d.y1 + d.y2) / 2;
      const inStaffNow = inZone(staff, fx, fy) || inZone(staff, fx, cy);
      if (inStaffNow) k.staffHits++;
      const isStaff = inStaffNow || (k.hits >= 3 && k.staffHits / k.hits > 0.5);
      if (isStaff) {
        this.everSeen.delete(k.id);
        k.queueEnter = null; k.queueLastIn = null;
      } else if (k.hits >= 2) this.everSeen.add(k.id);
      if (!isStaff && inZone(queue, fx, fy)) {
        if (k.queueEnter === null) k.queueEnter = t;
        k.queueLastIn = t;
      } else if (k.queueEnter !== null && t - (k.queueLastIn ?? t) > this.grace) {
        this.closeVisit(k);
      }
      states.push({
        id: k.id, box: d, conf: d.conf, t, vx: k.vx, vy: k.vy,
        kind: isStaff ? "staff" : k.queueEnter !== null ? "queue" : "customer",
        waitSec: k.queueEnter !== null ? t - k.queueEnter : 0,
      });
    });

    // drop tracks that have been missing too long
    this.tracks = this.tracks.filter((k) => {
      if (t - k.lastT <= this.maxAge) return true;
      if (k.queueEnter !== null) this.closeVisit(k);
      return false;
    });
    return states;
  }

  private closeVisit(k: Track) {
    const w = (k.queueLastIn ?? k.lastT) - (k.queueEnter ?? k.lastT);
    if (w >= this.minWait) this.completedWaits.push(w);
    k.queueEnter = null; k.queueLastIn = null;
  }
}

export function computeStats(states: TrackState[], t: number, ms: number, s: EngineSettings): FrameStats {
  const customers = states.filter((k) => k.kind !== "staff");
  const waits = states.filter((k) => k.kind === "queue").map((k) => k.waitSec);
  const avg = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  const max = waits.length ? Math.max(...waits) : 0;
  const ins = makeInsight(waits.length, avg, max, s);
  return {
    t, visitorsNow: customers.length, queueCount: waits.length,
    staffCount: states.length - customers.length,
    avgWaitSec: avg, maxWaitSec: max, cxScore: cxIndex(avg, waits.length, s.waitThresholdSec),
    level: ins.level, insightAr: ins.ar, insightEn: ins.en, inferenceMs: ms,
  };
}
