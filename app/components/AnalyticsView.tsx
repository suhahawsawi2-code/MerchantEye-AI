"use client";

// Analytics tab: charts and tables built from the same customer journeys the dashboard shows
// (browser video analysis, a results file from the cloud pipeline, or the café-day simulation).

import React, { useMemo } from "react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Download, Film, Flame, PieChart } from "lucide-react";
import {
  clockLabel, customerScore, leftQueue, leftUnserved, mmss, serviceStatus, summarize,
  type Journey, type JourneySettings,
} from "../lib/journey";
import type { ActiveJourneyData } from "./JourneyPanel";

type Props = {
  isAr: boolean;
  data: ActiveJourneyData | null;
  settings: JourneySettings;
  onGoToDashboard: () => void;
};

const INK = "#0F172A";
const MUTED = "#64748B";
const GRID = "#E2E8F0";
const SERIES = "#2563EB";
const PEAK_FILL = "#F59E0B";

// status colours carry state only and always sit next to a text label
const OUTCOME = [
  { key: "ok", ar: "خدمة في الوقت", en: "Served on time", color: "#059669" },
  { key: "near", ar: "قريب من الحد", en: "Close to the limit", color: "#D97706" },
  { key: "late", ar: "خدمة متأخرة", en: "Served late", color: "#E11D48" },
  { key: "unserved", ar: "طلب وخرج بدون خدمة", en: "Ordered, left unserved", color: "#9F1239" },
  { key: "walkout", ar: "ترك الطابور قبل الطلب", en: "Left the queue", color: "#7C2D12" },
  { key: "waiting", ar: "لسا ينتظر", en: "Still waiting", color: "#94A3B8" },
] as const;
type OutcomeKey = (typeof OUTCOME)[number]["key"];

function outcomeOf(j: Journey, now: number, s: JourneySettings): OutcomeKey | null {
  if (leftQueue(j)) return "walkout";
  if (leftUnserved(j)) return "unserved";
  if (j.tServed !== null) return serviceStatus(j, now, s).level;
  if (j.tExit === null) return "waiting";
  return null;   // walked through without queueing (not a customer of the counter)
}

/** Bucket width: an hour for a café day, a round step giving ~12 bars for a video. */
function bucketSize(mode: "video" | "day", span: number) {
  if (mode === "day") return 3600;
  const target = span / 12;
  return [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800].find((x) => x >= target) ?? 3600;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmtDur = (sec: number | null) => (sec === null ? "—" : mmss(sec));

export default function AnalyticsView({ isAr, data, settings, onGoToDashboard }: Props) {
  const t = (ar: string, en: string) => (isAr ? ar : en);

  const a = useMemo(() => {
    if (!data || !data.journeys.length) return null;
    const { journeys, now, mode, peaks } = data;
    const t0 = Math.min(...journeys.map((j) => j.tEnter));
    const startAt = mode === "day" ? Math.floor(t0 / 3600) * 3600 : 0;
    const size = bucketSize(mode, Math.max(1, now - startAt));
    const n = Math.max(1, Math.ceil((now - startAt) / size));
    const buckets = Array.from({ length: n }, (_, i) => ({
      start: startAt + i * size, label: clockLabel(startAt + i * size, mode),
      arrivals: 0, scores: [] as number[], cx: null as number | null, waits: [] as number[], avgWait: null as number | null,
    }));
    for (const j of journeys) {
      const b = buckets[Math.min(n - 1, Math.max(0, Math.floor((j.tEnter - startAt) / size)))];
      b.arrivals++;
      const sc = customerScore(j, settings);
      if (sc) b.scores.push(sc.total);
      if (j.tServed !== null) b.waits.push(j.tServed - j.tEnter);
    }
    for (const b of buckets) {
      const c = avg(b.scores); b.cx = c === null ? null : Math.round(c);
      const w = avg(b.waits); b.avgWait = w === null ? null : Math.round(w);
    }

    const outcomes = OUTCOME.map((o) => ({ ...o, label: isAr ? o.ar : o.en, count: 0 }));
    for (const j of journeys) {
      const k = outcomeOf(j, now, settings);
      if (k) outcomes.find((o) => o.key === k)!.count++;
    }

    const orderWait = avg(journeys.filter((j) => j.tOrder !== null).map((j) => j.tOrder! - j.tEnter));
    const prep = avg(journeys.filter((j) => j.tOrder !== null && j.tServed !== null).map((j) => j.tServed! - j.tOrder!));
    const stay = avg(journeys.filter((j) => j.tServed !== null && j.tExit !== null).map((j) => j.tExit! - j.tServed!));
    const stages = [
      { label: t("من الدخول إلى إنهاء الطلب", "Entry to order placed"), sec: orderWait },
      { label: t("من الطلب إلى استلامه", "Order to service"), sec: prep },
      { label: t("من الاستلام إلى الخروج", "Service to exit"), sec: stay },
    ];

    const tables = new Map<number, { sessions: number; waits: number[]; stays: number[] }>();
    for (const j of journeys) {
      if (j.table === null) continue;
      const row = tables.get(j.table) ?? { sessions: 0, waits: [], stays: [] };
      row.sessions++;
      if (j.tServed !== null) row.waits.push(j.tServed - j.tEnter);
      if (j.tServed !== null && j.tExit !== null) row.stays.push(j.tExit - j.tServed);
      tables.set(j.table, row);
    }
    const tableRows = [...tables.entries()].sort((x, y) => x[0] - y[0])
      .map(([k, v]) => ({ table: k + 1, sessions: v.sessions, wait: avg(v.waits), stay: avg(v.stays), late: v.waits.filter((w) => w >= settings.serveLimitSec).length }));

    const modeRows = (["pickup", "table"] as const).map((m) => {
      const js = journeys.filter((j) => j.serveMode === m && j.tServed !== null);
      return { mode: m, n: js.length, wait: avg(js.map((j) => j.tServed! - j.tEnter)), late: js.filter((j) => j.tServed! - j.tEnter >= settings.serveLimitSec).length };
    });

    const peakAreas = peaks.map((p) => ({ x1: clockLabel(Math.floor((p.start - startAt) / size) * size + startAt, mode), x2: clockLabel(Math.floor(((p.end ?? now) - startAt) / size) * size + startAt, mode), p }));
    const summary = summarize(journeys, now, settings, peaks, mode);
    return { buckets, size, outcomes, stages, tableRows, modeRows, peakAreas, summary };
  }, [data, settings, isAr]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !a) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-sm">
        <PieChart className="mx-auto text-slate-300" size={40} />
        <h3 className="mt-4 font-extrabold text-slate-900">{t("ما فيه بيانات للتحليل بعد", "No data to analyse yet")}</h3>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
          {t("شغّلي فيديو في اللوحة الرئيسية، أو ارفعي ملف نتائج من التحليل السحابي، أو شغّلي محاكاة يوم الكافيه. التحليلات تُبنى من نفس رحلات العملاء.",
             "Play a video on the dashboard, upload a results file from the cloud analysis, or run the café-day simulation. Analytics are built from the same customer journeys.")}
        </p>
        <button onClick={onGoToDashboard} className="mt-5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">
          {t("روحي للوحة الرئيسية", "Go to the dashboard")}
        </button>
      </div>
    );
  }

  const { mode, now, journeys } = data;
  const s = a.summary;
  const sourceLabel = data.source === "sim" ? t("محاكاة يوم كافيه", "Café-day simulation")
    : data.source === "file" ? t(`ملف نتائج: ${data.label}`, `Results file: ${data.label}`)
    : t(`فيديو: ${data.label || "مرفوع"}`, `Video: ${data.label || "uploaded"}`);
  const bucketText = mode === "day" ? t("لكل ساعة", "per hour") : t(`كل ${a.size} ث`, `per ${a.size} s`);

  const exportCsv = () => {
    const cell = (v: string | number | null | undefined) => {
      const x = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
    };
    const tm = (x: number | null) => (x === null ? "" : clockLabel(x, mode));
    const head = ["customer", "enter", "queue", "order", "served", "serve_mode", "table", "exit", "entry_to_service_sec", "service_to_exit_sec", "outcome", "cx_score", "invoice", "invoice_type", "amount"];
    const rows = journeys.map((j) => [
      j.id, tm(j.tEnter), tm(j.tQueue), tm(j.tOrder), tm(j.tServed), j.serveMode ?? "", j.table === null ? "" : j.table + 1, tm(j.tExit),
      j.tServed === null ? "" : Math.round(j.tServed - j.tEnter), j.tServed === null || j.tExit === null ? "" : Math.round(j.tExit - j.tServed),
      outcomeOf(j, now, settings) ?? "", customerScore(j, settings)?.total ?? "", j.invoice?.id ?? "", j.invoice?.type ?? "", j.invoice?.amount ?? "",
    ]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `customer_journeys_${data.source}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const outcomeCount = a.outcomes.reduce((x, o) => x + o.count, 0);
  const outcomeTotal = outcomeCount || 1;
  const maxStage = Math.max(1, ...a.stages.map((x) => x.sec ?? 0));

  return (
    <div className="space-y-6">
      {/* source line */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Film size={15} className="text-blue-600" />
          <span className="font-bold text-slate-800">{sourceLabel}</span>
          <span>·</span>
          <span>{data.ended ? t("التحليل مكتمل", "Analysis complete") : t("يتحدّث مباشرة", "Updating live")}</span>
          <span>·</span>
          <span dir="ltr">{mode === "day" && now >= 24 * 3600 ? "24:00" : clockLabel(now, mode)}</span>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 shadow-sm">
          <Download size={15} className="text-blue-600" />
          {t("تصدير رحلات العملاء (CSV)", "Export customer journeys (CSV)")}
        </button>
      </div>

      {/* headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label={t("مؤشر تجربة العملاء", "CX index")} value={s.cx ? `${s.cx.score}` : "—"} sub={s.cx ? t(`من 100 · ${s.cx.n} عميل`, `of 100 · ${s.cx.n} customers`) : t("لسا ما فيه عملاء انخدموا", "No one served yet")} />
        <Stat label={t("العملاء", "Customers")} value={`${s.total}`} sub={mode === "day" ? t(`الهدف ${settings.dailyTarget} · ${s.targetPct}%`, `Target ${settings.dailyTarget} · ${s.targetPct}%`) : t(`${s.dineIn} داخل المحل · ${s.takeaway} سفري`, `${s.dineIn} dine-in · ${s.takeaway} takeaway`)} />
        <Stat label={t("انخدموا في الوقت", "Served on time")} value={s.served ? `${s.onTimePct}%` : "—"} sub={t(`${s.lateCount} متأخر من ${s.served}`, `${s.lateCount} late of ${s.served}`)} />
        <Stat label={t("متوسط الدخول ← الخدمة", "Avg entry → service")} value={s.served ? mmss(s.avgToServiceSec) : "—"} sub={t(`الحد ${mmss(settings.serveLimitSec)}`, `Limit ${mmss(settings.serveLimitSec)}`)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* arrivals + peaks */}
        <Card title={t("دخول العملاء وأوقات الذروة", "Arrivals and peak time")} sub={bucketText}>
          {a.peakAreas.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-800 mb-2">
              <Flame size={13} />
              {t("المظلّل = وقت ذروة رصده النظام: ", "Shaded = peak detected: ")}
              <span dir="ltr">{a.peakAreas.map((x) => `${clockLabel(x.p.start, mode)}–${x.p.end === null ? t("مستمر", "ongoing") : clockLabel(x.p.end, mode)}`).join(" · ")}</span>
            </p>
          )}
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a.buckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                {a.peakAreas.map((x, i) => (
                  <ReferenceArea key={i} x1={x.x1} x2={x.x2} fill={PEAK_FILL} fillOpacity={0.14} ifOverflow="extendDomain" />
                ))}
                <Tooltip cursor={{ fill: "#F1F5F9" }} content={<Tip render={(p) => [`${p.label}`, t(`${p.arrivals} عميل دخل`, `${p.arrivals} customers arrived`)]} />} />
                <Bar dataKey="arrivals" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* CX over time */}
        <Card title={t("مؤشر تجربة العملاء عبر الوقت", "CX index over time")} sub={t(`${bucketText} · حسب وقت دخول العميل`, `${bucketText} · by arrival time`)}>
          <div dir="ltr" className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={a.buckets} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: MUTED }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ stroke: "#94A3B8", strokeDasharray: "3 3" }} content={<Tip render={(p) => [`${p.label}`, p.cx === null ? t("ما فيه عملاء مكتملين", "No finished customers") : t(`المؤشر ${p.cx} من 100 · متوسط الانتظار ${fmtDur(p.avgWait)}`, `Index ${p.cx}/100 · avg wait ${fmtDur(p.avgWait)}`)]} />} />
                <Line type="monotone" dataKey="cx" stroke={SERIES} strokeWidth={2} dot={{ r: 4, fill: SERIES, stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* where the time goes */}
        <Card title={t("وين يروح وقت العميل", "Where the customer's time goes")} sub={t("متوسط كل مرحلة", "Average per stage")}>
          <div className="space-y-4 pt-2">
            {a.stages.map((x) => (
              <div key={x.label}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-semibold text-slate-700">{x.label}</span>
                  <span dir="ltr" className="font-bold text-slate-900">{fmtDur(x.sec)}</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${((x.sec ?? 0) / maxStage) * 100}%`, background: SERIES }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-slate-500 pt-1">
              {t(`حد الطلب ${mmss(settings.orderLimitSec)} · حد الخدمة ${mmss(settings.serveLimitSec)} من لحظة الدخول`, `Order limit ${mmss(settings.orderLimitSec)} · service limit ${mmss(settings.serveLimitSec)} from entry`)}
            </p>
          </div>
        </Card>

        {/* outcomes */}
        <Card title={t("نتيجة كل عميل", "How each customer ended")} sub={t(`${outcomeCount} عميل`, `${outcomeCount} customers`)}>
          <div className="space-y-3 pt-1">
            {a.outcomes.map((o) => (
              <div key={o.key} className="flex items-center gap-3 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: o.color }} />
                <span className="w-40 shrink-0 text-slate-700 font-semibold">{o.label}</span>
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(o.count / outcomeTotal) * 100}%`, background: o.color }} />
                </div>
                <span dir="ltr" className="w-20 text-end font-bold text-slate-900">{o.count} <span className="font-normal text-slate-500">({Math.round((o.count / outcomeTotal) * 100)}%)</span></span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* dine-in vs takeaway */}
        <Card title={t("داخل المحل مقابل سفري", "Dine-in vs takeaway")} sub={t("من الدخول إلى الخدمة", "Entry to service")}>
          <SimpleTable
            head={[t("النوع", "Type"), t("عملاء انخدموا", "Served"), t("متوسط الانتظار", "Avg wait"), t("متأخر", "Late")]}
            rows={a.modeRows.map((r) => [r.mode === "table" ? t("داخل المحل (على الطاولة)", "Dine-in (at table)") : t("سفري / استلام من الكاونتر", "Takeaway / counter pickup"), `${r.n}`, fmtDur(r.wait), `${r.late}`])}
          />
        </Card>

        {/* tables */}
        <Card title={t("الطاولات", "Tables")} sub={t("كل جلسة على طاولة", "Every seated session")}>
          {a.tableRows.length ? (
            <SimpleTable
              head={[t("طاولة", "Table"), t("جلسات", "Sessions"), t("متوسط الانتظار للخدمة", "Avg wait for service"), t("متوسط الجلوس بعد الخدمة", "Avg stay after service"), t("متأخر", "Late")]}
              rows={a.tableRows.map((r) => [`${r.table}`, `${r.sessions}`, fmtDur(r.wait), fmtDur(r.stay), `${r.late}`])}
            />
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center">{t("ما جلس أحد على طاولة في هذا التحليل.", "No one sat at a table in this analysis.")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="font-extrabold text-sm" style={{ color: INK }}>{title}</h3>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900"><span dir="ltr">{value}</span></p>
      <p className="mt-1 text-[11px] text-slate-500">{sub}</p>
    </div>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto max-h-72">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-white">
          <tr className="text-slate-500 border-b border-slate-100">{head.map((h) => <th key={h} className="py-2 px-2 text-start font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              {r.map((c, k) => <td key={k} className={`py-2 px-2 ${k === 0 ? "font-semibold text-slate-800" : "text-slate-700"}`}><span dir={k === 0 ? undefined : "ltr"}>{c}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type TipPayload = { label: string; arrivals: number; cx: number | null; avgWait: number | null };
function Tip({ active, payload, render }: { active?: boolean; payload?: { payload: TipPayload }[]; render: (p: TipPayload) => string[] }) {
  if (!active || !payload?.length) return null;
  const [head, ...lines] = render(payload[0].payload);
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-md text-xs">
      <p dir="ltr" className="font-bold text-slate-900">{head}</p>
      {lines.map((l) => <p key={l} className="text-slate-600 mt-0.5">{l}</p>)}
    </div>
  );
}
