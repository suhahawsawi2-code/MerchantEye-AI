// MerchantEye AI — customer journey model (café "Customer package").
// A journey = one customer (or group) from entry to exit:
//   enter -> queue -> order -> served (pickup counter or at the table) -> exit
// Every journey source (browser video analysis, the Python/RF-DETR pipeline, the café simulation)
// produces Journey objects; everything below (lateness, peak time, alerts, the analyst summary)
// only reads those numbers — never the video.

export type ServeMode = "pickup" | "table";

export type Invoice = {
  id: string;
  t: number;                       // time the invoice was opened (same clock as the journeys)
  type: "dine_in" | "takeaway";
  amount: number;                  // SAR
  items: number;
};

export type Journey = {
  id: number;
  tEnter: number;
  tQueue: number | null;           // started queueing / reached the order counter
  tOrder: number | null;           // finished ordering (left the order counter, or invoice opened)
  tServed: number | null;          // received the order
  serveMode: ServeMode | null;
  tSeated: number | null;
  table: number | null;            // table index (0-based) when seated
  tExit: number | null;
  lastSeen: number;
  invoice?: Invoice | null;
};

export type JourneySettings = {
  orderLimitSec: number;           // entry -> order
  serveLimitSec: number;           // entry -> served  (the main "on time / late" rule)
  dailyTarget: number;             // customers per day
  avgTicket: number;               // SAR, used for lost-sales estimates when there is no invoice
  peakWindowSec: number;           // arrivals are counted over this window
  peakMinArrivals: number;         // a peak needs at least this many arrivals in the window
  queueLimit: number;              // people queueing at once before an alert
};

export const DEFAULT_JOURNEY_SETTINGS: JourneySettings = {
  orderLimitSec: 4 * 60,
  serveLimitSec: 8 * 60,
  dailyTarget: 250,
  avgTicket: 30,
  peakWindowSec: 30 * 60,
  peakMinArrivals: 12,
  queueLimit: 5,
};

/** Seconds instead of minutes: for short test clips (a few seconds to a few minutes long). */
export const SHORT_VIDEO_SETTINGS: JourneySettings = {
  ...DEFAULT_JOURNEY_SETTINGS,
  orderLimitSec: 6,
  serveLimitSec: 12,
  peakWindowSec: 10,
  peakMinArrivals: 4,
  queueLimit: 4,
};

export type Stage = "entered" | "queue" | "ordered" | "served" | "seated" | "left";

export function stageOf(j: Journey): Stage {
  if (j.tExit !== null) return "left";
  if (j.tSeated !== null && j.tServed !== null) return "seated";
  if (j.tServed !== null) return "served";
  if (j.tSeated !== null) return "seated";
  if (j.tOrder !== null) return "ordered";
  if (j.tQueue !== null) return "queue";
  return "entered";
}

export const STAGE_LABEL: Record<Stage, { ar: string; en: string }> = {
  entered: { ar: "دخل", en: "Entered" },
  queue: { ar: "في الطابور", en: "Queueing" },
  ordered: { ar: "ينتظر طلبه", en: "Waiting for order" },
  served: { ar: "استلم طلبه", en: "Served" },
  seated: { ar: "جالس", en: "Seated" },
  left: { ar: "خرج", en: "Left" },
};

export type Level = "ok" | "near" | "late";

/** Entry -> service, against the limit. Unserved journeys keep counting until they leave. */
export function serviceStatus(j: Journey, now: number, s: JourneySettings) {
  const end = j.tServed ?? j.tExit ?? now;
  const elapsed = Math.max(0, end - j.tEnter);
  const level: Level = elapsed >= s.serveLimitSec ? "late" : elapsed >= 0.8 * s.serveLimitSec ? "near" : "ok";
  return { elapsed, level, done: j.tServed !== null };
}

/** A journey that left after ordering but was never seen being served. */
export const leftUnserved = (j: Journey) => j.tExit !== null && j.tServed === null && j.tOrder !== null;
/** A journey that left the queue before ordering. */
export const leftQueue = (j: Journey) => j.tExit !== null && j.tQueue !== null && j.tOrder === null && j.tServed === null;

// ------------------------------------------------------------------ time labels

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Clock label: "video" -> m:ss from the start of the clip, "day" -> HH:MM (t = seconds since midnight). */
export function clockLabel(t: number, mode: "video" | "day") {
  if (mode === "video") return mmss(t);
  const m = Math.floor(t / 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ peak time

/** Arrivals in the last window; a peak starts at 1.5x the usual rate (and at least the minimum), ends below 60 % of it. */
export function arrivalsInWindow(journeys: Journey[], now: number, windowSec: number) {
  return journeys.filter((j) => j.tEnter <= now && j.tEnter > now - windowSec).length;
}

export function peakThreshold(journeys: Journey[], now: number, s: JourneySettings, t0: number) {
  // baseline = average arrivals per window so far
  const span = Math.max(s.peakWindowSec, now - t0);
  const total = journeys.filter((j) => j.tEnter <= now).length;
  const baseline = (total / span) * s.peakWindowSec;
  return Math.max(s.peakMinArrivals, Math.ceil(1.5 * baseline));
}

// ------------------------------------------------------------------ live alerts

export type AlertLevel = "urgent" | "ops" | "info";
export type AlertEvent = { key: string; t: number; level: AlertLevel; ar: string; en: string };

export type PeakSpan = { start: number; end: number | null; maxArrivals: number };

/** Turns journey snapshots into a stream of alerts. Keeps its own memory so each alert fires once. */
export class AlertMonitor {
  private fired = new Set<string>();
  private inPeak = false;
  private queueAlarm = false;
  private t0: number | null = null;
  peaks: PeakSpan[] = [];

  constructor(private mode: "video" | "day") {}

  update(journeys: Journey[], now: number, s: JourneySettings): AlertEvent[] {
    if (this.t0 === null) this.t0 = journeys.length ? Math.min(now, ...journeys.map((j) => j.tEnter)) : now;
    const out: AlertEvent[] = [];
    const at = (t: number) => clockLabel(t, this.mode);
    const push = (key: string, t: number, level: AlertLevel, ar: string, en: string) => {
      if (this.fired.has(key)) return;
      this.fired.add(key);
      out.push({ key, t, level, ar, en });
    };

    // peak start / end
    const arrivals = arrivalsInWindow(journeys, now, s.peakWindowSec);
    const thr = peakThreshold(journeys, now, s, this.t0);
    const winLabel = s.peakWindowSec >= 60 ? `${Math.round(s.peakWindowSec / 60)} دقائق` : `${s.peakWindowSec} ثانية`;
    const winLabelEn = s.peakWindowSec >= 60 ? `${Math.round(s.peakWindowSec / 60)} min` : `${s.peakWindowSec} s`;
    if (!this.inPeak && arrivals >= thr) {
      this.inPeak = true;
      this.peaks.push({ start: now, end: null, maxArrivals: arrivals });
      push(`peak-start-${this.peaks.length}`, now, "info",
        `بدأ وقت الذروة الآن: ${arrivals} عميل دخلوا خلال آخر ${winLabel}.`,
        `Peak time has started: ${arrivals} customers arrived in the last ${winLabelEn}.`);
    } else if (this.inPeak) {
      const p = this.peaks[this.peaks.length - 1];
      p.maxArrivals = Math.max(p.maxArrivals, arrivals);
      if (arrivals < 0.6 * thr) {
        this.inPeak = false;
        p.end = now;
        const dur = this.mode === "day" ? `${Math.round((now - p.start) / 60)} دقيقة` : mmss(now - p.start);
        push(`peak-end-${this.peaks.length}`, now, "info",
          `انتهت الذروة. استمرت ${dur} (من ${at(p.start)} إلى ${at(now)}).`,
          `Peak ended after ${this.mode === "day" ? Math.round((now - p.start) / 60) + " min" : mmss(now - p.start)} (${at(p.start)}–${at(now)}).`);
      }
    }

    // long queue
    const queueing = journeys.filter((j) => j.tExit === null && j.tQueue !== null && j.tOrder === null && j.tServed === null).length;
    if (!this.queueAlarm && queueing >= s.queueLimit) {
      this.queueAlarm = true;
      push(`queue-${now.toFixed(1)}`, now, "ops",
        `الطابور طويل: ${queueing} أشخاص ينتظرون الطلب. افتحوا كاشير إضافي.`,
        `Long queue: ${queueing} people waiting to order. Open another till.`);
    } else if (this.queueAlarm && queueing <= Math.max(1, s.queueLimit - 2)) this.queueAlarm = false;

    for (const j of journeys) {
      const where = j.table !== null ? `طاولة ${j.table + 1}` : `العميل #${j.id}`;
      const whereEn = j.table !== null ? `Table ${j.table + 1}` : `Customer #${j.id}`;
      // late service (still waiting)
      if (j.tExit === null && j.tServed === null && now - j.tEnter >= s.serveLimitSec) {
        push(`late-${j.id}`, now, "ops",
          `${where} ينتظر الخدمة من ${mmss(now - j.tEnter)} (الحد ${mmss(s.serveLimitSec)}).`,
          `${whereEn} has been waiting for service for ${mmss(now - j.tEnter)} (limit ${mmss(s.serveLimitSec)}).`);
      }
      if (leftUnserved(j)) {
        push(`unserved-${j.id}`, j.tExit!, "ops",
          `العميل #${j.id} طلب وخرج بدون ما نرصد إنه استلم طلبه.`,
          `Customer #${j.id} ordered and left without being seen receiving the order.`);
      }
      if (leftQueue(j)) {
        push(`walkout-${j.id}`, j.tExit!, "ops",
          `العميل #${j.id} طلع من الطابور قبل ما يطلب.`,
          `Customer #${j.id} left the queue before ordering.`);
      }
    }
    return out;
  }
}

// ------------------------------------------------------------------ the analyst's summary

export type DaySummary = {
  total: number;
  targetPct: number;
  served: number;
  onTimePct: number;
  avgToServiceSec: number;
  avgOrderWaitSec: number;
  avgPrepSec: number;
  avgStaySec: number;
  lateCount: number;
  lateInPeak: number;
  leftUnserved: number;
  walkouts: number;
  lostSales: number;
  dineIn: number;
  takeaway: number;
  revenue: number | null;
  worst: { id: number; table: number | null; sec: number } | null;
  peaks: PeakSpan[];
  busiestHour: { hourStart: number; count: number } | null;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(journeys: Journey[], now: number, s: JourneySettings, peaks: PeakSpan[], mode: "video" | "day"): DaySummary {
  const seen = journeys.filter((j) => j.tEnter <= now);
  const served = seen.filter((j) => j.tServed !== null);
  const statuses = served.map((j) => ({ j, st: serviceStatus(j, now, s) }));
  const lateAll = seen.filter((j) => serviceStatus(j, now, s).level === "late");
  const worstJ = [...seen].sort((a, b) => serviceStatus(b, now, s).elapsed - serviceStatus(a, now, s).elapsed)[0];
  const withInv = seen.filter((j) => j.invoice);
  const walk = seen.filter(leftQueue);

  // busiest hour (day) / busiest minute (video)
  const bucket = mode === "day" ? 3600 : 60;
  const counts = new Map<number, number>();
  for (const j of seen) { const b = Math.floor(j.tEnter / bucket) * bucket; counts.set(b, (counts.get(b) ?? 0) + 1); }
  let busiest: DaySummary["busiestHour"] = null;
  for (const [b, c] of counts) if (!busiest || c > busiest.count) busiest = { hourStart: b, count: c };

  return {
    total: seen.length,
    targetPct: s.dailyTarget > 0 ? Math.round((100 * seen.length) / s.dailyTarget) : 0,
    served: served.length,
    onTimePct: statuses.length ? Math.round((100 * statuses.filter((x) => x.st.level !== "late").length) / statuses.length) : 0,
    avgToServiceSec: avg(served.map((j) => j.tServed! - j.tEnter)),
    avgOrderWaitSec: avg(seen.filter((j) => j.tOrder !== null).map((j) => j.tOrder! - j.tEnter)),
    avgPrepSec: avg(served.filter((j) => j.tOrder !== null).map((j) => j.tServed! - j.tOrder!)),
    avgStaySec: avg(served.filter((j) => j.tExit !== null).map((j) => j.tExit! - j.tServed!)),
    lateCount: lateAll.length,
    lateInPeak: lateAll.filter((j) => peaks.some((p) => j.tEnter >= p.start - s.peakWindowSec && j.tEnter <= (p.end ?? now))).length,
    leftUnserved: seen.filter(leftUnserved).length,
    walkouts: walk.length,
    lostSales: Math.round(walk.length * s.avgTicket),
    dineIn: seen.filter((j) => j.invoice ? j.invoice.type === "dine_in" : j.tSeated !== null).length,
    takeaway: seen.filter((j) => j.invoice ? j.invoice.type === "takeaway" : j.tExit !== null && j.tSeated === null && j.tServed !== null).length,
    revenue: withInv.length ? Math.round(withInv.reduce((a, j) => a + (j.invoice?.amount ?? 0), 0)) : null,
    worst: worstJ ? { id: worstJ.id, table: worstJ.table, sec: serviceStatus(worstJ, now, s).elapsed } : null,
    peaks,
    busiestHour: busiest,
  };
}

/** The "owner" voice: a short Arabic/English end-of-day message built from the numbers only. */
export function summaryText(d: DaySummary, s: JourneySettings, mode: "video" | "day") {
  const at = (t: number) => clockLabel(t, mode);
  const ar: string[] = [];
  const en: string[] = [];
  const period = mode === "day" ? "اليوم" : "في الفيديو";
  const periodEn = mode === "day" ? "today" : "in this video";

  if (mode === "day") {
    const met = d.total >= s.dailyTarget;
    ar.push(`دخل ${period} ${d.total} عميل من هدف ${s.dailyTarget} (${d.targetPct}٪)${met ? "، وحققنا الهدف." : "، وما وصلنا الهدف."}`);
    en.push(`${d.total} customers ${periodEn} against a target of ${s.dailyTarget} (${d.targetPct}%)${met ? " — target met." : " — target missed."}`);
  } else {
    ar.push(`رصدنا ${period} ${d.total} عميل.`);
    en.push(`${d.total} customers detected ${periodEn}.`);
  }
  if (d.served) {
    ar.push(`${d.onTimePct}٪ من اللي انخدموا كانت خدمتهم في الوقت، ومتوسط الوقت من الدخول للخدمة ${mmss(d.avgToServiceSec)}.`);
    en.push(`${d.onTimePct}% of served customers were served on time; average entry-to-service ${mmss(d.avgToServiceSec)}.`);
  }
  if (d.peaks.length) {
    const p = d.peaks.reduce((a, b) => (b.maxArrivals > a.maxArrivals ? b : a));
    ar.push(`أقوى ذروة كانت من ${at(p.start)} إلى ${p.end !== null ? at(p.end) : "الآن"}.`);
    en.push(`Strongest peak: ${at(p.start)}–${p.end !== null ? at(p.end) : "now"}.`);
  } else if (d.busiestHour) {
    ar.push(`أكثر وقت زحمة كان ${at(d.busiestHour.hourStart)} (${d.busiestHour.count} عميل).`);
    en.push(`Busiest period started at ${at(d.busiestHour.hourStart)} (${d.busiestHour.count} customers).`);
  }
  if (d.worst && d.worst.sec >= s.serveLimitSec) {
    const w = d.worst.table !== null ? `طاولة ${d.worst.table + 1}` : `العميل #${d.worst.id}`;
    ar.push(`أطول تأخير: ${w} انتظر ${mmss(d.worst.sec)}.`);
    en.push(`Longest delay: ${d.worst.table !== null ? `table ${d.worst.table + 1}` : `customer #${d.worst.id}`} waited ${mmss(d.worst.sec)}.`);
  }
  if (d.walkouts) {
    ar.push(`${d.walkouts} عميل طلعوا من الطابور قبل ما يطلبون، تقريباً ${d.lostSales} ريال مبيعات ضايعة.`);
    en.push(`${d.walkouts} customers left the queue before ordering — about ${d.lostSales} SAR in lost sales.`);
  }
  if (d.revenue !== null) {
    ar.push(`مبيعات الفواتير المربوطة: ${d.revenue} ريال (محلي ${d.dineIn}، سفري ${d.takeaway}).`);
    en.push(`Linked invoice sales: ${d.revenue} SAR (dine-in ${d.dineIn}, takeaway ${d.takeaway}).`);
  }

  // one recommendation
  let recAr = "الأداء ممتاز. حافظوا على نفس توزيع الموظفين.";
  let recEn = "Strong performance. Keep the same staffing.";
  if (d.served && d.onTimePct < 80) {
    if (d.avgPrepSec > d.avgOrderWaitSec) {
      recAr = "أغلب التأخير من التحضير مو من الطابور. زيدوا باريستا وقت الذروة.";
      recEn = "Most of the delay is preparation, not the queue. Add a barista at peak time.";
    } else {
      recAr = "أغلب التأخير من الطابور. افتحوا كاشير إضافي وقت الذروة.";
      recEn = "Most of the delay is the queue. Open an extra till at peak time.";
    }
  } else if (d.lateCount >= 3 && d.lateInPeak / d.lateCount >= 0.6 && d.peaks.length) {
    const p = d.peaks.reduce((a, b) => (b.maxArrivals > a.maxArrivals ? b : a));
    recAr = `أغلب التأخير (${d.lateInPeak} من ${d.lateCount}) صار وقت الذروة. زيدوا موظف من ${at(p.start)} إلى ${p.end !== null ? at(p.end) : "آخر الدوام"}.`;
    recEn = `Most delays (${d.lateInPeak} of ${d.lateCount}) happened at peak time. Add one staff member ${at(p.start)}–${p.end !== null ? at(p.end) : "close"}.`;
  } else if (d.walkouts >= 3) {
    recAr = "عملاء يطلعون من الطابور. خففوا الانتظار عند الكاشير وقت الذروة.";
    recEn = "Customers are walking out of the queue. Cut till waiting time at peak.";
  }
  ar.push(`التوصية: ${recAr}`);
  en.push(`Recommendation: ${recEn}`);
  return { ar: ar.join(" "), en: en.join(" ") };
}

// ------------------------------------------------------------------ invoices (POS file)

/** CSV: invoice_id,time_sec,type,amount,items   (type = dine_in | takeaway). time_sec = seconds from the video start. */
export function parseInvoicesCsv(text: string): Invoice[] {
  const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: Invoice[] = [];
  for (const r of rows) {
    const c = r.split(",").map((x) => x.trim());
    const t = Number(c[1]);
    if (!Number.isFinite(t)) continue; // header or bad row
    const type = /take|سفري/i.test(c[2] ?? "") ? "takeaway" : "dine_in";
    out.push({ id: c[0] || `INV-${out.length + 1}`, t, type, amount: Number(c[3]) || 0, items: Number(c[4]) || 1 });
  }
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ results file (shared with analysis/journey.py)

export type JourneyResults = {
  source: string;                  // "browser-yolov8n" | "python-rfdetr" | ...
  video?: string;
  duration: number;
  journeys: Journey[];
};

export function parseResults(text: string): JourneyResults {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.journeys)) throw new Error("not a journeys file");
  const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const journeys: Journey[] = d.journeys.map((j: Record<string, unknown>, i: number) => ({
    id: num(j.id) ?? i + 1,
    tEnter: num(j.tEnter) ?? 0,
    tQueue: num(j.tQueue), tOrder: num(j.tOrder), tServed: num(j.tServed),
    serveMode: j.serveMode === "pickup" || j.serveMode === "table" ? j.serveMode : null,
    tSeated: num(j.tSeated), table: num(j.table), tExit: num(j.tExit),
    lastSeen: num(j.lastSeen) ?? num(j.tExit) ?? num(j.tEnter) ?? 0,
    invoice: (j.invoice as Invoice) ?? null,
  }));
  const duration = num(d.duration) ?? Math.max(0, ...journeys.map((j) => j.lastSeen));
  return { source: String(d.source ?? "file"), video: d.video, duration, journeys };
}
