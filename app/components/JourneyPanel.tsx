"use client";

// Customer package: live journey board, alerts (incl. "peak time has started"), and the AI analyst's day summary.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Route, Bell, Sparkles, Play, Pause, RotateCcw, FileUp, Settings2, Flame, Receipt, Clapperboard, Video } from "lucide-react";
import {
  AlertMonitor, DEFAULT_JOURNEY_SETTINGS, cxIndex, SHORT_VIDEO_SETTINGS, STAGE_LABEL, arrivalsInWindow, clockLabel, leftQueue, leftUnserved, mmss,
  parseInvoicesCsv, parseResults, serviceStatus, stageOf, summarize, summaryText,
  type AlertEvent, type Invoice, type Journey, type JourneySettings, type PeakSpan,
} from "../lib/journey";
import { SIM_DAY_END, SIM_DAY_START, simulateDay, viewAt } from "../lib/cafeSimulation";

export type VideoJourneyFeed = { journeys: Journey[]; now: number; ended: boolean; runId: number; label: string };

/** What the analytics page needs: the journeys of whatever is active on the board (video, results file or simulation). */
export type ActiveJourneyData = {
  journeys: Journey[]; now: number; ended: boolean; mode: "video" | "day"; peaks: PeakSpan[];
  source: "video" | "file" | "sim"; label: string; key: string;
};

type Props = {
  isAr: boolean;
  video: VideoJourneyFeed | null;
  settings: JourneySettings;
  onSettings: (s: JourneySettings) => void;
  onInvoices: (inv: Invoice[]) => void;
  onActive?: (d: ActiveJourneyData | null) => void;
};

type Source = "video" | "file" | "sim";

const LEVEL_COLOR = { ok: "bg-emerald-500", near: "bg-amber-500", late: "bg-rose-500" } as const;
const LEVEL_TEXT = { ok: "text-emerald-700", near: "text-amber-700", late: "text-rose-700" } as const;

export default function JourneyPanel({ isAr, video, settings, onSettings, onInvoices, onActive }: Props) {
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const [source, setSource] = useState<Source>("video");
  // a newly opened video always takes over the board, even if a results file or the simulation was showing
  const [seenRun, setSeenRun] = useState<number | null>(null);
  if (video && video.runId !== seenRun) {
    setSeenRun(video.runId);
    if (source !== "video") setSource("video");
  }

  // --- simulation clock
  const day = useMemo(() => simulateDay(7), []);
  const [simNow, setSimNow] = useState(SIM_DAY_START);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState(240);   // simulated seconds per real second
  useEffect(() => {
    if (source !== "sim" || !simRunning) return;
    const iv = setInterval(() => setSimNow((n) => {
      const next = Math.min(SIM_DAY_END, n + simSpeed / 4);
      if (next >= SIM_DAY_END) setSimRunning(false);
      return next;
    }), 250);
    return () => clearInterval(iv);
  }, [source, simRunning, simSpeed]);

  // --- results file (from the Python / RF-DETR pipeline or a browser export)
  const [file, setFile] = useState<{ name: string; source: string; duration: number; journeys: Journey[] } | null>(null);
  const [fileErr, setFileErr] = useState("");
  const loadResults = async (f: File) => {
    try { const r = parseResults(await f.text()); setFile({ name: f.name, ...r }); setFileErr(""); setSource("file"); }
    catch { setFileErr(t("الملف مو ملف نتائج رحلة عميل", "Not a customer-journey results file")); }
  };
  const [invoiceCount, setInvoiceCount] = useState(0);
  const loadInvoices = async (f: File) => {
    const inv = parseInvoicesCsv(await f.text());
    setInvoiceCount(inv.length);
    onInvoices(inv);
  };

  // --- the active feed
  const mode: "video" | "day" = source === "sim" ? "day" : "video";
  const feed = useMemo(() => {
    if (source === "sim") return { journeys: viewAt(day, simNow), now: simNow, ended: simNow >= SIM_DAY_END, key: "sim" };
    if (source === "file") return file ? { journeys: file.journeys, now: file.duration, ended: true, key: `file-${file.name}` } : null;
    return video ? { journeys: video.journeys, now: video.now, ended: video.ended, key: `video-${video.runId}` } : null;
  }, [source, day, simNow, file, video]);

  // --- alerts: one monitor per run; a loaded file is replayed so its peaks/alerts appear in order
  const monitorRef = useRef<{ key: string; m: AlertMonitor } | null>(null);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [inPeak, setInPeak] = useState(false);
  useEffect(() => {
    if (!feed) return;
    let fresh = false;
    if (!monitorRef.current || monitorRef.current.key !== feed.key) {
      monitorRef.current = { key: feed.key, m: new AlertMonitor(mode) };
      fresh = true;
    }
    const m = monitorRef.current.m;
    let evs: AlertEvent[] = [];
    if (source === "file" && fresh) {
      const t0 = Math.min(0, ...feed.journeys.map((j) => j.tEnter));
      const step = Math.max(0.5, (feed.now - t0) / 300);
      for (let x = t0; x <= feed.now + 1e-6; x += step) evs.push(...m.update(viewAt(feed.journeys, x), x, settings));
    } else evs = m.update(feed.journeys, feed.now, settings);
    const open = m.peaks.length > 0 && m.peaks[m.peaks.length - 1].end === null;
    setInPeak(open);
    setAlerts((a) => (fresh ? evs.reverse() : evs.length ? [...evs.reverse(), ...a] : a).slice(0, 60));
    onActive?.({
      journeys: feed.journeys, now: feed.now, ended: feed.ended, mode, source, key: feed.key,
      peaks: m.peaks.map((p) => ({ ...p })),
      label: source === "sim" ? "sim" : source === "file" ? (file?.name ?? "") : (video?.label ?? ""),
    });
  }, [feed, settings, mode, source, onActive, file, video]);
  useEffect(() => { if (!feed) onActive?.(null); }, [feed, onActive]);

  // --- numbers
  const journeys = feed?.journeys ?? [];
  const now = feed?.now ?? 0;
  const active = journeys.filter((j) => j.tExit === null).sort((a, b) => a.tEnter - b.tEnter);
  const served = journeys.filter((j) => j.tServed !== null);
  const onTime = served.filter((j) => serviceStatus(j, now, settings).level !== "late").length;
  const avgTo = served.length ? served.reduce((a, j) => a + (j.tServed! - j.tEnter), 0) / served.length : 0;
  const stays = served.filter((j) => j.tExit !== null);
  const avgStay = stays.length ? stays.reduce((a, j) => a + (j.tExit! - j.tServed!), 0) / stays.length : 0;
  const lost = journeys.filter((j) => leftUnserved(j) || leftQueue(j)).length;
  const cx = cxIndex(journeys, settings);

  // --- analyst summary
  const [summaryState, setSummary] = useState<{ ar: string; en: string; at: number; key: string } | null>(null);
  const summary = summaryState && summaryState.key === feed?.key ? summaryState : null;
  const makeSummary = () => {
    if (!feed || !monitorRef.current) return;
    const d = summarize(journeys, now, settings, monitorRef.current.m.peaks, mode);
    setSummary({ ...summaryText(d, settings, mode), at: now, key: feed.key });
  };
  const autoKey = useRef("");
  useEffect(() => {
    if (feed?.ended && journeys.length && autoKey.current !== feed.key) { autoKey.current = feed.key; makeSummary(); }
    if (!feed?.ended && autoKey.current === feed?.key) autoKey.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed?.ended, feed?.key]);

  const [showSettings, setShowSettings] = useState(false);
  const recent = [...journeys].sort((a, b) => b.tEnter - a.tEnter).slice(0, 10);
  const span = Math.max(1, ...recent.map((j) => (j.tExit ?? now) - j.tEnter));

  const tab = (s: Source, icon: React.ReactNode, label: string) => (
    <button onClick={() => setSource(s)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${source === s ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"}`}>
      {icon}{label}
    </button>
  );

  return (
    <section className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <h2 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
          <Route size={18} className="text-blue-600" />
          {t("رحلة العميل: من الدخول إلى الخروج", "Customer journey: entry to exit")}
          {feed && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">{clockLabel(now, mode)}</span>}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {tab("video", <Video size={13} />, t("من الفيديو", "From video"))}
          {tab("file", <FileUp size={13} />, t("ملف نتائج", "Results file"))}
          {tab("sim", <Clapperboard size={13} />, t("محاكاة يوم كافيه", "Café day simulation"))}
        </div>
      </div>

      {/* source controls */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {source === "video" && (
          <>
            <span className="text-slate-500 font-semibold">
              {video ? `${video.label}` : t("شغّلي فيديو في شاشة التحليل فوق، وارسمي منطقة الاستلام والطاولات.", "Play a video in the vision panel above and set the pickup and table zones.")}
            </span>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold border border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
              <Receipt size={13} />{invoiceCount ? t(`فواتير مربوطة: ${invoiceCount}`, `Invoices: ${invoiceCount}`) : t("ربط ملف فواتير (CSV)", "Link invoices (CSV)")}
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadInvoices(f); e.target.value = ""; }} />
            </label>
          </>
        )}
        {source === "file" && (
          <>
            <label className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-slate-900 text-white">
              <FileUp size={13} />{t("رفع ملف النتائج (JSON)", "Upload results (JSON)")}
              <input type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) loadResults(f); e.target.value = ""; }} />
            </label>
            <span className="text-slate-500 font-semibold">
              {file ? `${file.name} · ${file.source} · ${file.journeys.length} ${t("رحلة", "journeys")}` : t("الملف اللي يطلّعه analysis/journey.py (موديل RF-DETR) أو زر التنزيل في شاشة التحليل.", "The file from analysis/journey.py (RF-DETR) or the vision panel's download button.")}
            </span>
            {fileErr && <span className="text-rose-600 font-bold">{fileErr}</span>}
          </>
        )}
        {source === "sim" && (
          <>
            <button onClick={() => setSimRunning((r) => !r)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold bg-slate-900 text-white">
              {simRunning ? <Pause size={13} /> : <Play size={13} />}{simRunning ? t("إيقاف", "Pause") : t("تشغيل اليوم", "Run the day")}
            </button>
            <button onClick={() => { setSimNow(SIM_DAY_START); setSimRunning(false); monitorRef.current = null; }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold border border-slate-200 bg-white text-slate-700">
              <RotateCcw size={13} />{t("من البداية", "Restart")}
            </button>
            {[120, 240, 600].map((sp) => (
              <button key={sp} onClick={() => setSimSpeed(sp)} className={`px-2.5 py-1.5 rounded-xl font-bold border ${simSpeed === sp ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200"}`}>
                {t(`${sp / 60} دقيقة/ثانية`, `${sp / 60} min/s`)}
              </button>
            ))}
            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg font-bold">{t("بيانات محاكاة للعرض، مو من كاميرا", "Simulated data for demo, not from a camera")}</span>
          </>
        )}
        <button onClick={() => setShowSettings((v) => !v)} className="ms-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold border border-slate-200 bg-white text-slate-700">
          <Settings2 size={13} />{t("حدود التأخير والهدف", "Limits & target")}
        </button>
      </div>

      {showSettings && <SettingsForm isAr={isAr} s={settings} onChange={onSettings} />}
      {source !== "sim" && feed && feed.now > 0 && feed.now < 300 && settings.serveLimitSec >= 60 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-600 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
          {t("الفيديو قصير وحدود التأخير بالدقائق، فما راح يطلع تأخير.", "Short clip with limits in minutes: nothing will show as late.")}
          <button onClick={() => onSettings(SHORT_VIDEO_SETTINGS)} className="px-2.5 py-1 rounded-lg bg-blue-600 text-white">{t("استخدمي حدود الفيديو القصير (بالثواني)", "Use short-clip limits (seconds)")}</button>
        </div>
      )}

      {inPeak && (
        <div className="flex items-center gap-2 p-3 rounded-2xl bg-orange-50 border border-orange-200 text-orange-800 text-xs font-extrabold">
          <Flame size={16} />{t(`وقت الذروة الآن: ${arrivalsInWindow(journeys, now, settings.peakWindowSec)} عميل في آخر ${settings.peakWindowSec >= 60 ? Math.round(settings.peakWindowSec / 60) + " دقائق" : settings.peakWindowSec + " ثانية"}`, "Peak time now")}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label={t("مؤشر تجربة العملاء", "Customer experience index")} value={cx ? `${cx.score} / 100` : "—"}
          sub={cx ? t(`الطلب ${cx.order}/40 · الخدمة ${cx.serve}/60`, `Order ${cx.order}/40 · Service ${cx.serve}/60`) : t("يظهر بعد أول عميل ينخدم", "Shows after the first served customer")}
          bar={cx ? cx.score / 100 : undefined} warn={!!cx && cx.score < 70} />
        <Tile label={source === "sim" ? t("العملاء / الهدف اليومي", "Customers / daily target") : t("العملاء", "Customers")}
          value={source === "sim" ? `${journeys.length} / ${settings.dailyTarget}` : `${journeys.length}`}
          bar={source === "sim" ? Math.min(1, journeys.length / Math.max(1, settings.dailyTarget)) : undefined} />
        <Tile label={t("الخدمة في الوقت", "Served on time")} value={served.length ? `${Math.round((100 * onTime) / served.length)}٪` : "—"} sub={t(`${served.length} انخدموا`, `${served.length} served`)} />
        <Tile label={t("من الدخول إلى الخدمة", "Entry → service")} value={served.length ? mmss(avgTo) : "—"} sub={t(`الحد ${mmss(settings.serveLimitSec)}`, `limit ${mmss(settings.serveLimitSec)}`)} />
        <Tile label={t("من الخدمة إلى الخروج", "Service → exit")} value={stays.length ? mmss(avgStay) : "—"} />
        <Tile label={t("طلعوا بدون خدمة", "Left without service")} value={`${lost}`} warn={lost > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* live customers */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-900">{t(`العملاء الآن (${active.length})`, `In the café now (${active.length})`)}</h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {active.length === 0 && <p className="text-[11px] text-slate-400">{t("ما فيه عملاء حالياً", "No customers right now")}</p>}
            {active.slice(-25).reverse().map((j) => {
              const st = serviceStatus(j, now, settings);
              const stage = stageOf(j);
              return (
                <div key={j.id} className="flex items-center gap-2 text-[11px] p-2 rounded-xl bg-slate-50">
                  <span className={`w-2 h-2 rounded-full ${st.done ? "bg-emerald-500" : LEVEL_COLOR[st.level]}`} />
                  <span className="font-extrabold text-slate-900">#{j.id}</span>
                  <span className="text-slate-600 font-semibold">{STAGE_LABEL[stage][isAr ? "ar" : "en"]}{j.table !== null ? ` · ${t("طاولة", "table")} ${j.table + 1}` : ""}</span>
                  {j.invoice && <span className="text-[10px] px-1.5 rounded bg-blue-100 text-blue-800 font-bold">{j.invoice.type === "dine_in" ? t("محلي", "dine-in") : t("سفري", "takeaway")}</span>}
                  <span className={`ms-auto font-mono font-bold ${st.done ? "text-emerald-700" : LEVEL_TEXT[st.level]}`}>
                    {st.done ? `✓ ${mmss(st.elapsed)}` : mmss(st.elapsed)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* journey timelines */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-900">{t("الخط الزمني لآخر العملاء", "Latest journeys")}</h3>
          <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-500">
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{t("طابور وطلب", "Queue & order")}</span>
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-amber-400" />{t("انتظار الخدمة", "Waiting for service")}</span>
            <span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{t("بعد الخدمة", "After service")}</span>
          </div>
          <div className="space-y-1.5" dir="ltr">
            {recent.map((j) => {
              const end = j.tExit ?? now;
              const order = j.tOrder ?? (j.tServed ?? end);
              const servedAt = j.tServed ?? end;
              const w = (a: number, b: number) => `${(100 * Math.max(0, b - a)) / span}%`;
              const st = serviceStatus(j, now, settings);
              return (
                <div key={j.id} className="flex items-center gap-2">
                  <span className="w-8 text-[10px] font-bold text-slate-500">#{j.id}</span>
                  <div className="flex-1 h-3 rounded bg-slate-100 overflow-hidden flex">
                    <div className="bg-blue-500 h-full" style={{ width: w(j.tEnter, Math.min(order, servedAt)) }} />
                    <div className={`${st.level === "late" ? "bg-rose-500" : "bg-amber-400"} h-full`} style={{ width: w(Math.min(order, servedAt), servedAt) }} />
                    {j.tServed !== null && <div className="bg-emerald-500 h-full" style={{ width: w(servedAt, end) }} />}
                  </div>
                  <span className="w-10 text-[10px] font-mono text-slate-500 text-right">{mmss(end - j.tEnter)}</span>
                </div>
              );
            })}
            {recent.length === 0 && <p className="text-[11px] text-slate-400" dir={isAr ? "rtl" : "ltr"}>{t("بتظهر هنا رحلات العملاء", "Journeys will appear here")}</p>}
          </div>
        </div>

        {/* alerts */}
        <div className="rounded-2xl border border-slate-200 p-4 space-y-2">
          <h3 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5"><Bell size={14} className="text-rose-500" />{t("التنبيهات", "Alerts")}</h3>
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {alerts.length === 0 && <p className="text-[11px] text-slate-400">{t("ما فيه تنبيهات", "No alerts")}</p>}
            {alerts.map((a) => (
              <div key={a.key} className={`text-[11px] p-2 rounded-xl border ${a.level === "urgent" ? "bg-rose-50 border-rose-200" : a.level === "ops" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                <span className="font-mono font-bold text-slate-500 me-1.5">{clockLabel(a.t, mode)}</span>
                <span className="font-semibold text-slate-800">{isAr ? a.ar : a.en}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* analyst */}
      <div className="p-4 rounded-2xl bg-gradient-to-l from-blue-50 to-indigo-50 border border-blue-200 space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-blue-600" />
          <h3 className="text-xs font-extrabold text-slate-900">{t("المحلل الذكي: ملخص اليوم", "AI analyst: day summary")}</h3>
          <button onClick={makeSummary} disabled={!journeys.length} className="ms-auto px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white disabled:opacity-40">
            {t("اكتب الملخص الآن", "Write summary now")}
          </button>
        </div>
        <p className="text-xs leading-relaxed font-semibold text-slate-800">
          {summary ? (isAr ? summary.ar : summary.en) : t("يطلع الملخص تلقائياً آخر اليوم (أو نهاية الفيديو)، ويقدر المالك يطلبه بأي وقت.", "The summary is written automatically at the end of the day (or video), or on demand.")}
        </p>
        {summary && <p className="text-[10px] text-slate-500 font-bold">{t(`مكتوب الساعة ${clockLabel(summary.at, mode)} من الأرقام فقط، بدون مشاهدة الفيديو.`, `Written at ${clockLabel(summary.at, mode)} from the numbers only.`)}</p>}
      </div>
    </section>
  );
}

function Tile({ label, value, sub, bar, warn }: { label: string; value: string; sub?: string; bar?: number; warn?: boolean }) {
  return (
    <div className="p-3 rounded-2xl border border-slate-200 bg-white space-y-1">
      <p className="text-[10px] font-bold text-slate-500">{label}</p>
      <p className={`text-lg font-extrabold ${warn ? "text-rose-600" : "text-slate-900"}`}><span dir="ltr">{value}</span></p>
      {sub && <p className="text-[10px] text-slate-400 font-semibold">{sub}</p>}
      {bar !== undefined && <div className="h-1.5 rounded bg-slate-100 overflow-hidden"><div className={`h-full ${bar >= 1 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${bar * 100}%` }} /></div>}
    </div>
  );
}

function SettingsForm({ isAr, s, onChange }: { isAr: boolean; s: JourneySettings; onChange: (s: JourneySettings) => void }) {
  const t = (ar: string, en: string) => (isAr ? ar : en);
  const minutes = s.serveLimitSec >= 60;
  const unit = minutes ? 60 : 1;
  const field = (label: string, key: keyof JourneySettings, scale = 1) => (
    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-600">
      {label}
      <input type="number" min={0} value={+(s[key] / scale).toFixed(1)}
        onChange={(e) => onChange({ ...s, [key]: Math.max(0, Number(e.target.value) || 0) * scale })}
        className="px-2 py-1.5 rounded-lg border border-slate-200 text-slate-900 w-28" />
    </label>
  );
  const u = minutes ? t("دقيقة", "min") : t("ثانية", "s");
  return (
    <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
      <div className="flex flex-wrap gap-4">
        {field(t(`الدخول → الخدمة (${u})`, `Entry → service (${u})`), "serveLimitSec", unit)}
        {field(t(`الدخول → الطلب (${u})`, `Entry → order (${u})`), "orderLimitSec", unit)}
        {field(t("الهدف اليومي (عميل)", "Daily target"), "dailyTarget")}
        {field(t("متوسط الفاتورة (ريال)", "Avg ticket (SAR)"), "avgTicket")}
        {field(t(`نافذة الذروة (${u})`, `Peak window (${u})`), "peakWindowSec", unit)}
        {field(t("أقل عدد للذروة", "Min arrivals for peak"), "peakMinArrivals")}
        {field(t("حد الطابور", "Queue limit"), "queueLimit")}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={() => onChange(DEFAULT_JOURNEY_SETTINGS)} className={`px-3 py-1.5 rounded-xl font-bold border ${minutes ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"}`}>
          {t("كافيه حقيقي (بالدقائق)", "Real café (minutes)")}
        </button>
        <button onClick={() => onChange(SHORT_VIDEO_SETTINGS)} className={`px-3 py-1.5 rounded-xl font-bold border ${!minutes ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-700"}`}>
          {t("فيديو قصير للتجربة (بالثواني)", "Short test clip (seconds)")}
        </button>
      </div>
    </div>
  );
}
