"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, Scan, Loader2, Download, Square, Film, Wand2, Check } from "lucide-react";
import {
  loadModel, detectPeople, QueueTracker, computeStats,
  type Zone, type TrackState, type FrameStats, type EngineSettings, type Detection,
} from "../lib/visionEngine";
import { JourneyTracker, tablesToZones, type CafeZones } from "../lib/journeyTracker";
import type { Invoice } from "../lib/journey";
import type { VideoJourneyFeed } from "./JourneyPanel";

type Props = {
  isAr: boolean;
  settings: EngineSettings;
  onStats: (s: FrameStats | null) => void;
  onJourneys?: (f: VideoJourneyFeed | null) => void;
  invoices?: Invoice[];
};

type EditMode = "none" | "queue" | "staff" | "pickup" | "table" | "door";

const ZONE_STYLE: Record<Exclude<EditMode, "none">, { color: string; tag: string; ar: string; en: string }> = {
  queue: { color: "#3B82F6", tag: "QUEUE", ar: "الطابور / الطلب", en: "Queue / order" },
  pickup: { color: "#8B5CF6", tag: "PICKUP", ar: "كاونتر الاستلام", en: "Pickup counter" },
  table: { color: "#10B981", tag: "TABLE", ar: "طاولة", en: "Table" },
  door: { color: "#F97316", tag: "DOOR", ar: "الباب", en: "Door" },
  staff: { color: "#94A3B8", tag: "STAFF", ar: "الموظفين", en: "Staff" },
};
const EMPTY_EXTRA = { pickup: [] as Zone[], table: [] as Zone[], door: [] as Zone[] };

const DEFAULT_QUEUE: Zone = { x1: 0.3, y1: 0.3, x2: 0.7, y2: 0.95 };

export default function LiveVisionPanel({ isAr, settings, onStats, onJourneys, invoices }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef(new QueueTracker());
  const journeyRef = useRef(new JourneyTracker());
  const itemsRef = useRef<Detection[]>([]);
  const tableSeenRef = useRef<Detection[]>([]);
  const framesRef = useRef(0);
  const runIdRef = useRef(0);
  const onJourneysRef = useRef(onJourneys);
  useEffect(() => { onJourneysRef.current = onJourneys; }, [onJourneys]);
  const invoicesRef = useRef<Invoice[]>(invoices ?? []);
  useEffect(() => { invoicesRef.current = invoices ?? []; journeyRef.current.setInvoices(invoicesRef.current); }, [invoices]);
  const statesRef = useRef<TrackState[]>([]);
  const busyRef = useRef(false);
  const lastTRef = useRef(-1);
  const historyRef = useRef<FrameStats[]>([]);
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoName, setVideoName] = useState("");
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [loadPct, setLoadPct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [ms, setMs] = useState(0);
  // several lanes / cashiers: one rectangle per queue and per cashier
  const [queueZones, setQueueZones] = useState<Zone[]>([DEFAULT_QUEUE]);
  const [queueCustom, setQueueCustom] = useState(false);
  const [staffZones, setStaffZones] = useState<Zone[]>([]);
  const [editMode, setEditMode] = useState<EditMode>("none");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<Zone | null>(null);
  const [extra, setExtra] = useState(EMPTY_EXTRA);   // pickup counters, tables, doors
  const [autoNote, setAutoNote] = useState("");
  const zonesRef = useRef({ queueZones, staffZones, extra });
  useEffect(() => { zonesRef.current = { queueZones, staffZones, extra }; }, [queueZones, staffZones, extra]);
  const cafeZones = (): CafeZones => {
    const z = zonesRef.current;
    return { queue: z.queueZones, staff: z.staffZones, pickup: z.extra.pickup, tables: z.extra.table, door: z.extra.door };
  };
  const [hasResults, setHasResults] = useState(false);

  const t = (ar: string, en: string) => (isAr ? ar : en);

  // load the model once the panel is shown
  useEffect(() => {
    loadModel(setLoadPct).then(() => setModelState("ready")).catch(() => setModelState("error"));
  }, []);

  const resetAnalysis = useCallback(() => {
    trackerRef.current.reset();
    journeyRef.current.reset();
    journeyRef.current.setInvoices(invoicesRef.current);
    runIdRef.current++;
    statesRef.current = [];
    historyRef.current = [];
    itemsRef.current = [];
    framesRef.current = 0;
    setHasResults(false);
    onStats(null);
    onJourneysRef.current?.(null);
  }, [onStats]);

  const emitJourneys = (now: number, ended: boolean) => {
    onJourneysRef.current?.({
      journeys: journeyRef.current.journeys(), now, ended, runId: runIdRef.current,
      label: `${videoNameRef.current} · YOLOv8n`,
    });
  };
  const videoNameRef = useRef("");

  const openVideo = (src: string, name: string) => {
    resetAnalysis();
    tableSeenRef.current = [];
    setAutoNote("");
    setExtra((e) => ({ ...e, table: [] }));
    setVideoSrc(src);
    setVideoName(name);
    videoNameRef.current = name;
    setIsPlaying(true);
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openVideo(URL.createObjectURL(file), file.name);
    e.target.value = "";
  };

  // --- geometry: where the video image actually sits inside the (object-contain) box
  const contentRect = () => {
    const v = videoRef.current, w = wrapRef.current;
    if (!v || !w || !v.videoWidth) return null;
    const cw = w.clientWidth, ch = w.clientHeight;
    const s = Math.min(cw / v.videoWidth, ch / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    return { ox: (cw - dw) / 2, oy: (ch - dh) / 2, s, dw, dh, vw: v.videoWidth, vh: v.videoHeight };
  };

  // --- drawing
  const draw = useCallback(() => {
    const c = canvasRef.current, w = wrapRef.current;
    if (!c || !w) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== w.clientWidth * dpr || c.height !== w.clientHeight * dpr) {
      c.width = w.clientWidth * dpr; c.height = w.clientHeight * dpr;
    }
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w.clientWidth, w.clientHeight);
    const r = contentRect();
    if (!r) return;
    const zoneRect = (z: Zone) => [r.ox + z.x1 * r.dw, r.oy + z.y1 * r.dh, (z.x2 - z.x1) * r.dw, (z.y2 - z.y1) * r.dh] as const;

    ctx.direction = "ltr";
    ctx.textAlign = "left";
    const drawZone = (z: Zone, color: string, label: string) => {
      const [x, y, zw, zh] = zoneRect(z);
      ctx.fillStyle = color + "22"; ctx.fillRect(x, y, zw, zh);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, zw, zh); ctx.setLineDash([]);
      ctx.font = "bold 11px ui-monospace, monospace"; ctx.fillStyle = color; ctx.fillText(label, x + 6, y + 14);
    };
    const { queueZones: qz, staffZones: sz, extra: ex } = zonesRef.current;
    qz.forEach((z, i) => drawZone(z, ZONE_STYLE.queue.color, `QUEUE ${i + 1}`));
    sz.forEach((z, i) => drawZone(z, ZONE_STYLE.staff.color, `STAFF ${i + 1}`));
    ex.pickup.forEach((z, i) => drawZone(z, ZONE_STYLE.pickup.color, `PICKUP ${i + 1}`));
    ex.table.forEach((z, i) => drawZone(z, ZONE_STYLE.table.color, `T${i + 1}`));
    ex.door.forEach((z, i) => drawZone(z, ZONE_STYLE.door.color, `DOOR ${i + 1}`));
    if (dragRect && editMode !== "none") drawZone(dragRect, ZONE_STYLE[editMode].color, "");
    // cups / plates the detector sees (used for "served at the table")
    for (const d of itemsRef.current) {
      ctx.strokeStyle = "#A855F7"; ctx.lineWidth = 1.5;
      ctx.strokeRect(r.ox + d.x1 * r.s, r.oy + d.y1 * r.s, (d.x2 - d.x1) * r.s, (d.y2 - d.y1) * r.s);
    }

    const thr = settingsRef.current.waitThresholdSec;
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    const vt = videoRef.current?.currentTime ?? 0;
    for (const k of statesRef.current) {
      // extrapolate with the tracked motion so boxes stay on people while the next frame is analyzed
      const dt = Math.max(0, Math.min(0.6, vt - k.t));
      const x = r.ox + (k.box.x1 + k.vx * dt) * r.s, y = r.oy + (k.box.y1 + k.vy * dt) * r.s;
      const bw = (k.box.x2 - k.box.x1) * r.s, bh = (k.box.y2 - k.box.y1) * r.s;
      const color = k.kind === "staff" ? "#94A3B8"
        : k.kind === "customer" ? "#22C55E"
        : k.waitSec >= thr ? "#EF4444" : k.waitSec >= 0.6 * thr ? "#F59E0B" : "#3B82F6";
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
      const m = Math.round(k.waitSec);
      const label = k.kind === "staff" ? `Staff ${k.id}`
        : k.kind === "queue" ? `ID ${k.id} · ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`
        : `ID ${k.id} · ${Math.round(k.conf * 100)}%`;
      ctx.font = "bold 10px ui-monospace, monospace";
      const tw = ctx.measureText(label).width + 8;
      ctx.fillStyle = color; ctx.fillRect(x, Math.max(0, y - 15), tw, 15);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 4, Math.max(11, y - 4));
    }
  }, [dragRect, editMode]);

  // --- main loop: analyze the current frame whenever the model is free
  useEffect(() => {
    let raf = 0;
    const loop = async () => {
      raf = requestAnimationFrame(loop);
      draw();
      const v = videoRef.current;
      if (!v || busyRef.current || modelState !== "ready" || v.readyState < 2) return;
      // while paused, analyze the frame once (so boxes line up exactly), then idle
      if ((v.paused || v.ended) && v.currentTime === lastTRef.current) return;
      busyRef.current = true;
      try {
        const tNow = v.currentTime;
        if (tNow + 0.25 < lastTRef.current) resetAnalysis();   // seeked back / restarted
        lastTRef.current = tNow;
        const { dets, ms: took, objects } = await detectPeople(v, settingsRef.current.conf);
        const { queueZones: qz, staffZones: sz } = zonesRef.current;
        const states = trackerRef.current.update(dets, tNow, v.videoWidth, v.videoHeight, qz, sz);
        statesRef.current = states;
        itemsRef.current = objects.items;
        // tables: collect over the first frames, then turn them into table zones automatically
        framesRef.current++;
        if (framesRef.current <= 12) tableSeenRef.current.push(...objects.tables);
        if (framesRef.current === 12 && zonesRef.current.extra.table.length === 0) {
          const auto = tablesToZones(tableSeenRef.current, v.videoWidth, v.videoHeight);
          if (auto.length) {
            zonesRef.current = { ...zonesRef.current, extra: { ...zonesRef.current.extra, table: auto } };
            setExtra((e) => ({ ...e, table: auto }));
            setAutoNote(isAr ? `اكتشفنا ${auto.length} طاولات تلقائياً` : `${auto.length} tables found automatically`);
          }
        }
        journeyRef.current.update(states, objects.items, tNow, v.videoWidth, v.videoHeight, cafeZones());
        emitJourneys(tNow, false);
        const stats = computeStats(states, tNow, took, settingsRef.current);
        historyRef.current.push(stats);
        setHasResults(true);
        setMs(took);
        onStats(stats);
      } catch (err) {
        console.error("[MerchantEye] analysis error", err);
      } finally {
        busyRef.current = false;
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, modelState, onStats, resetAnalysis]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); }
  };

  // --- zone editing by dragging on the video
  const toNorm = (e: React.PointerEvent) => {
    const r = contentRect(), w = wrapRef.current;
    if (!r || !w) return null;
    const b = w.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left - r.ox) / r.dw)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top - r.oy) / r.dh)),
    };
  };
  // pause while drawing so the zone can be placed calmly, resume afterwards
  const resumeAfterEdit = useRef(false);
  const startEdit = (mode: EditMode) => {
    if (mode === "none" || editMode === mode) {
      setEditMode("none");
      if (resumeAfterEdit.current) { videoRef.current?.play(); resumeAfterEdit.current = false; }
      return;
    }
    const v = videoRef.current;
    if (v && !v.paused) { v.pause(); resumeAfterEdit.current = true; }
    setEditMode(mode);
  };
  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (editMode === "none") return;
    const p = toNorm(e); if (!p) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragStart(p); setDragRect({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragStart) return;
    const p = toNorm(e); if (!p) return;
    setDragRect({ x1: Math.min(dragStart.x, p.x), y1: Math.min(dragStart.y, p.y), x2: Math.max(dragStart.x, p.x), y2: Math.max(dragStart.y, p.y) });
  };
  const onUp = () => {
    if (!dragStart) return;
    const ok = !!dragRect && dragRect.x2 - dragRect.x1 > 0.03 && dragRect.y2 - dragRect.y1 > 0.03;
    if (!ok) { setDragStart(null); setDragRect(null); return; }   // a click, not a drag: stay in drawing mode
    if (dragRect) {
      if (editMode === "queue") {
        // the first drawn lane replaces the default zone, the next ones are added
        setQueueZones((zs) => (queueCustom ? [...zs, dragRect] : [dragRect]));
        setQueueCustom(true);
      } else if (editMode === "staff") setStaffZones((zs) => [...zs, dragRect]);
      else if (editMode !== "none") {
        const key = editMode;
        setExtra((e) => ({ ...e, [key]: [...e[key], dragRect] }));
      }
      resetAnalysis();
    }
    // stay in drawing mode so several zones can be drawn one after another; "Done" ends it
    setDragStart(null); setDragRect(null);
  };

  const detectTablesNow = () => {
    const v = videoRef.current;
    if (!v) return;
    const auto = tablesToZones(tableSeenRef.current, v.videoWidth, v.videoHeight);
    if (auto.length) { setExtra((e) => ({ ...e, table: auto })); resetAnalysis(); }
    setAutoNote(auto.length ? t(`اكتشفنا ${auto.length} طاولات تلقائياً`, `${auto.length} tables found automatically`) : t("ما لقينا طاولات واضحة. ارسميها بزر «طاولة».", "No clear tables found. Draw them with the Table button."));
  };

  const downloadResults = () => {
    const h = historyRef.current;
    const waits = trackerRef.current.finishedWaits;
    const summary = {
      video: videoName,
      model: "YOLOv8n (ONNX, in-browser)",
      analyzedFrames: h.length,
      avgInferenceMs: h.length ? Math.round(h.reduce((a, b) => a + b.inferenceMs, 0) / h.length) : null,
      uniqueCustomers: trackerRef.current.uniqueCustomers,
      peakQueue: Math.max(0, ...h.map((x) => x.queueCount)),
      peakCustomers: Math.max(0, ...h.map((x) => x.visitorsNow)),
      completedQueueVisits: waits.length,
      avgCompletedWaitSec: waits.length ? +(waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1) : 0,
      maxWaitSec: +Math.max(0, ...h.map((x) => x.maxWaitSec)).toFixed(1),
      settings: { ...settingsRef.current, queueZones: zonesRef.current.queueZones, staffZones: zonesRef.current.staffZones },
    };
    const frames = h.map((x) => ({ t: +x.t.toFixed(2), customers: x.visitorsNow, queue: x.queueCount, staff: x.staffCount, avgWaitSec: +x.avgWaitSec.toFixed(1) }));
    const journeys = journeyRef.current.journeys();
    const duration = videoRef.current?.duration || (h.length ? h[h.length - 1].t : 0);
    const blob = new Blob([JSON.stringify({ source: "browser-yolov8n", video: videoName, duration, journeys, zones: cafeZones(), summary, frames }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (videoName.replace(/\.[^.]+$/, "") || "analysis") + "_analysis.json";
    a.click();
  };

  const statusChip =
    modelState === "loading" ? { c: "bg-amber-100 text-amber-800", txt: `${t("تحميل نموذج YOLOv8", "Loading YOLOv8 model")} ${loadPct}%` } :
    modelState === "error" ? { c: "bg-rose-100 text-rose-800", txt: t("تعذّر تحميل النموذج", "Model failed to load") } :
    !videoSrc ? { c: "bg-emerald-100 text-emerald-800", txt: t("النموذج جاهز", "Model ready") } :
    { c: "bg-blue-100 text-blue-800", txt: `${t("تحليل مباشر", "Live analysis")} · ${ms ? Math.round(ms) + " ms/frame" : "…"}` };

  return (
    <div className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Scan size={18} className="text-blue-600" />
          {t("شاشة التحليل الحركي المباشر", "Live AI Vision Feed")}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${statusChip.c}`}>{statusChip.txt}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => openVideo("/demo/sample.mp4", "sample.mp4")} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-3 py-2 rounded-xl transition">
            <Film size={14} />{t("فيديو تجريبي", "Sample video")}
          </button>
          <label className="cursor-pointer flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded-xl transition">
            <Upload size={14} />{t("رفع فيديو", "Upload video")}
            <input type="file" accept="video/*" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div ref={wrapRef} className="relative w-full h-80 sm:h-96 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
        {videoSrc ? (
          <video ref={videoRef} src={videoSrc} autoPlay muted playsInline
            onEnded={() => { const end = videoRef.current?.duration ?? lastTRef.current; journeyRef.current.finish(end); emitJourneys(end, true); }}
            onLoadedMetadata={(e) => { e.currentTarget.playbackRate = slow ? 0.5 : 1; }}
            onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
            className="w-full h-full object-contain" />
        ) : (
          <div className="text-center space-y-2 p-6">
            <Film size={32} className="mx-auto text-blue-400" />
            <p className="text-xs font-bold text-slate-300">{t("ارفعي فيديو من كاميرا مراقبة أو جرّبي الفيديو التجريبي", "Upload a CCTV video or try the sample video")}</p>
            <p className="text-[11px] text-slate-500">{t("التحليل يتم داخل متصفحك، ولا يُرسل الفيديو لأي خادم", "Analysis runs in your browser — the video is never uploaded to a server")}</p>
          </div>
        )}
        <canvas ref={canvasRef}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ touchAction: editMode !== "none" ? "none" : "auto" }}
          className={`absolute inset-0 w-full h-full ${editMode !== "none" ? "cursor-crosshair z-30" : "pointer-events-none z-20"}`} />
        {videoSrc && staffZones.length === 0 && editMode === "none" && (
          <button onClick={() => startEdit("staff")}
            className="absolute top-3 left-3 z-30 bg-amber-500/95 hover:bg-amber-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow">
            {t("الكاشير يُحسب عميلاً؟ حدّدي منطقة الموظفين", "Cashier counted as a customer? Set the staff zone")}
          </button>
        )}
        {editMode !== "none" && (
          <div className="absolute top-3 inset-x-3 z-40 bg-slate-900/90 text-white text-xs font-bold p-2 rounded-xl text-center pointer-events-none">
            {editMode === "queue" ? t("اسحبي مستطيلاً فوق مكان وقوف العملاء عند الطلب.", "Drag a rectangle over where customers stand to order.")
              : editMode === "staff" ? t("اسحبي مستطيلاً يغطي الكاشير خلف الكاونتر.", "Drag a rectangle covering the cashier behind the counter.")
              : editMode === "pickup" ? t("اسحبي مستطيلاً فوق مكان استلام الطلبات.", "Drag a rectangle over the pickup counter.")
              : editMode === "table" ? t("اسحبي مستطيلاً حول كل طاولة مع كراسيها.", "Drag a rectangle around each table with its chairs.")
              : t("اسحبي مستطيلاً عند باب الدخول.", "Drag a rectangle at the entrance.")}
            <span className="block text-[11px] font-semibold text-slate-300">{t("تقدرين ترسمين أكثر من منطقة ورا بعض، واضغطي «تم» لما تخلصين.", "Draw as many as you need, then press Done.")}</span>
          </div>
        )}
        {videoSrc && (
          <button onClick={togglePlay} className="absolute bottom-4 right-4 z-30 p-2.5 rounded-xl bg-slate-900/80 text-white border border-slate-700">
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
        )}
        {modelState === "loading" && videoSrc && (
          <div className="absolute bottom-4 left-4 z-30 flex items-center gap-2 text-xs font-bold text-white bg-slate-900/80 px-3 py-2 rounded-xl">
            <Loader2 size={14} className="animate-spin" />{t("تحميل النموذج", "Loading model")} {loadPct}%
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {(["queue", "pickup", "table", "door", "staff"] as const).map((m) => {
          const z = ZONE_STYLE[m];
          const n = m === "queue" ? (queueCustom ? queueZones.length : 0) : m === "staff" ? staffZones.length : extra[m].length;
          const on = editMode === m;
          return (
            <button key={m} onClick={() => startEdit(m)} disabled={!videoSrc}
              style={on ? { background: z.color, borderColor: z.color } : { color: z.color }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition disabled:opacity-40 ${on ? "text-white" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
              {on ? <Check size={13} /> : <Square size={13} />}
              {on ? t("تم", "Done") : `${n ? "+ " : ""}${t(z.ar, z.en)}${n ? ` (${n})` : ""}`}
            </button>
          );
        })}
        <button onClick={detectTablesNow} disabled={!videoSrc || !hasResults}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border border-emerald-200 bg-emerald-50 text-emerald-700 disabled:opacity-40">
          <Wand2 size={13} />{t("اكتشاف الطاولات تلقائياً", "Auto-detect tables")}
        </button>
        <button onClick={() => { const next = !slow; setSlow(next); if (videoRef.current) videoRef.current.playbackRate = next ? 0.5 : 1; }} disabled={!videoSrc}
          className={`px-3 py-2 rounded-xl font-bold border transition disabled:opacity-40 ${slow ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
          {t("تشغيل بطيء 0.5x", "Slow 0.5x")}
        </button>
        {autoNote && <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold">{autoNote}</span>}
        {(queueCustom || staffZones.length > 0 || extra.pickup.length + extra.table.length + extra.door.length > 0) && (
          <button onClick={() => { setQueueZones([DEFAULT_QUEUE]); setQueueCustom(false); setStaffZones([]); setExtra(EMPTY_EXTRA); setAutoNote(""); resetAnalysis(); }} className="px-2 py-2 text-slate-500 hover:text-slate-800 font-bold">
            {t("مسح المناطق", "Clear zones")}
          </button>
        )}
        <button onClick={downloadResults} disabled={!hasResults}
          className="ms-auto flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-40">
          <Download size={13} />{t("تنزيل النتائج (JSON)", "Download results (JSON)")}
        </button>
      </div>
    </div>
  );
}
