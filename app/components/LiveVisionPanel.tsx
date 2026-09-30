"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, Scan, Loader2, Download, Square, Film } from "lucide-react";
import {
  loadModel, detectPeople, QueueTracker, computeStats,
  type Zone, type TrackState, type FrameStats, type EngineSettings,
} from "../lib/visionEngine";

type Props = {
  isAr: boolean;
  settings: EngineSettings;
  onStats: (s: FrameStats | null) => void;
};

type EditMode = "none" | "queue" | "staff";

const DEFAULT_QUEUE: Zone = { x1: 0.3, y1: 0.3, x2: 0.7, y2: 0.95 };

export default function LiveVisionPanel({ isAr, settings, onStats }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef(new QueueTracker());
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
  const zonesRef = useRef({ queueZones, staffZones });
  useEffect(() => { zonesRef.current = { queueZones, staffZones }; }, [queueZones, staffZones]);
  const [hasResults, setHasResults] = useState(false);

  const t = (ar: string, en: string) => (isAr ? ar : en);

  // load the model once the panel is shown
  useEffect(() => {
    loadModel(setLoadPct).then(() => setModelState("ready")).catch(() => setModelState("error"));
  }, []);

  const resetAnalysis = useCallback(() => {
    trackerRef.current.reset();
    statesRef.current = [];
    historyRef.current = [];
    setHasResults(false);
    onStats(null);
  }, [onStats]);

  const openVideo = (src: string, name: string) => {
    resetAnalysis();
    setVideoSrc(src);
    setVideoName(name);
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
    const { queueZones: qz, staffZones: sz } = zonesRef.current;
    qz.forEach((z, i) => drawZone(z, "#3B82F6", `QUEUE ${i + 1}`));
    sz.forEach((z, i) => drawZone(z, "#94A3B8", `STAFF ${i + 1}`));
    if (dragRect) drawZone(dragRect, editMode === "staff" ? "#94A3B8" : "#3B82F6", "");

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
        lastTRef.current = tNow;
        const { dets, ms: took } = await detectPeople(v, settingsRef.current.conf);
        const { queueZones: qz, staffZones: sz } = zonesRef.current;
        const states = trackerRef.current.update(dets, tNow, v.videoWidth, v.videoHeight, qz, sz);
        statesRef.current = states;
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
  }, [draw, modelState, onStats]);

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
  const onDown = (e: React.PointerEvent) => {
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
    if (dragRect && dragRect.x2 - dragRect.x1 > 0.03 && dragRect.y2 - dragRect.y1 > 0.03) {
      if (editMode === "queue") {
        // the first drawn lane replaces the default zone, the next ones are added
        setQueueZones((zs) => (queueCustom ? [...zs, dragRect] : [dragRect]));
        setQueueCustom(true);
      } else if (editMode === "staff") setStaffZones((zs) => [...zs, dragRect]);
      resetAnalysis();
    }
    setDragStart(null); setDragRect(null); setEditMode("none");
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
    const blob = new Blob([JSON.stringify({ summary, frames }, null, 1)], { type: "application/json" });
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
          <video ref={videoRef} src={videoSrc} autoPlay loop muted playsInline
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
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
          className={`absolute inset-0 w-full h-full ${editMode !== "none" ? "cursor-crosshair z-30" : "pointer-events-none z-20"}`} />
        {videoSrc && staffZones.length === 0 && editMode === "none" && (
          <button onClick={() => setEditMode("staff")}
            className="absolute top-3 left-3 z-30 bg-amber-500/95 hover:bg-amber-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shadow">
            {t("الكاشير يُحسب عميلاً؟ حدّدي منطقة الموظفين", "Cashier counted as a customer? Set the staff zone")}
          </button>
        )}
        {editMode !== "none" && (
          <div className="absolute top-3 inset-x-3 z-40 bg-slate-900/90 text-white text-xs font-bold p-2 rounded-xl text-center pointer-events-none">
            {editMode === "queue" ? t("اسحبي مستطيلاً فوق مكان وقوف الطابور", "Drag a rectangle over where the queue stands")
              : t("اسحبي مستطيلاً يغطي الكاشير خلف الكاونتر (من رأسه إلى الكاونتر)", "Drag a rectangle covering the cashier behind the counter")}
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
        <button onClick={() => setEditMode(editMode === "queue" ? "none" : "queue")} disabled={!videoSrc}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition disabled:opacity-40 ${editMode === "queue" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"}`}>
          <Square size={13} />{queueCustom ? t("+ منطقة طابور أخرى", "+ Another queue zone") : t("تحديد منطقة الطابور", "Set queue zone")}
        </button>
        <button onClick={() => setEditMode(editMode === "staff" ? "none" : "staff")} disabled={!videoSrc}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition disabled:opacity-40 ${editMode === "staff" ? "bg-slate-600 text-white border-slate-600" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
          <Square size={13} />{staffZones.length ? t("+ كاشير آخر", "+ Another cashier") : t("منطقة الموظفين (اختياري)", "Staff zone (optional)")}
        </button>
        <button onClick={() => { const next = !slow; setSlow(next); if (videoRef.current) videoRef.current.playbackRate = next ? 0.5 : 1; }} disabled={!videoSrc}
          className={`px-3 py-2 rounded-xl font-bold border transition disabled:opacity-40 ${slow ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
          {t("تشغيل بطيء 0.5x", "Slow 0.5x")}
        </button>
        {(queueCustom || staffZones.length > 0) && (
          <button onClick={() => { setQueueZones([DEFAULT_QUEUE]); setQueueCustom(false); setStaffZones([]); resetAnalysis(); }} className="px-2 py-2 text-slate-500 hover:text-slate-800 font-bold">
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
