"use client";

// Branches: one card per café branch with its customer-experience index and current state.
// The selected branch shows the live numbers from the analysis on the dashboard; the other
// branches carry sample numbers until a video from that branch is analysed (marked "sample").

import React from "react";
import { Store, ChevronLeft, ChevronRight, Flame } from "lucide-react";
import type { ActiveJourneyData } from "./JourneyPanel";
import { cxIndex, leftQueue, leftUnserved, serviceStatus, type JourneySettings } from "../lib/journey";

export type Branch = { id: string; code: string; ar: string; en: string; cityAr: string; cityEn: string;
  sample: { cx: number; customers: number; onTime: number; late: number; peak: boolean } };

export const BRANCHES: Branch[] = [
  { id: "riy-main", code: "RIY", ar: "فرع الرياض الرئيسي", en: "Riyadh Main Branch", cityAr: "الرياض · العليا", cityEn: "Riyadh · Olaya",
    sample: { cx: 86, customers: 212, onTime: 91, late: 9, peak: false } },
  { id: "riy-north", code: "RYN", ar: "فرع الرياض الشمالي", en: "Riyadh North Branch", cityAr: "الرياض · الملقا", cityEn: "Riyadh · Al Malqa",
    sample: { cx: 78, customers: 184, onTime: 83, late: 17, peak: true } },
  { id: "jed", code: "JED", ar: "فرع جدة", en: "Jeddah Branch", cityAr: "جدة · التحلية", cityEn: "Jeddah · Tahlia",
    sample: { cx: 92, customers: 236, onTime: 95, late: 4, peak: false } },
  { id: "khb", code: "KHB", ar: "فرع الخبر", en: "Khobar Branch", cityAr: "الخبر · الكورنيش", cityEn: "Khobar · Corniche",
    sample: { cx: 64, customers: 141, onTime: 72, late: 26, peak: true } },
];

type Props = {
  isAr: boolean;
  current: string;
  data: ActiveJourneyData | null;
  settings: JourneySettings;
  onOpen: (id: string) => void;
};

export default function BranchesView({ isAr, current, data, settings, onOpen }: Props) {
  const t = (ar: string, en: string) => (isAr ? ar : en);

  // live numbers for the branch whose videos are being analysed now
  const live = (() => {
    if (!data || !data.journeys.length) return null;
    const js = data.journeys;
    const cx = cxIndex(js, settings);
    const served = js.filter((j) => j.tServed !== null);
    const onTime = served.filter((j) => serviceStatus(j, data.now, settings).level !== "late").length;
    const lost = js.filter((j) => leftUnserved(j) || leftQueue(j)).length;
    const peak = data.peaks.length > 0 && data.peaks[data.peaks.length - 1].end === null;
    return { cx: cx?.score ?? null, customers: js.length, onTime: served.length ? Math.round((onTime / served.length) * 100) : null, late: served.length - onTime + lost, peak };
  })();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {BRANCHES.map((b) => {
          const isCurrent = b.id === current;
          const n = isCurrent && live ? live : b.sample;
          const isLive = isCurrent && !!live;
          const cx = n.cx;
          const level = cx === null ? "none" : cx >= 85 ? "good" : cx >= 70 ? "warn" : "bad";
          const badge = {
            good: { c: "bg-emerald-50 text-emerald-700 border-emerald-200", ar: "ممتاز", en: "Good" },
            warn: { c: "bg-amber-50 text-amber-700 border-amber-200", ar: "يحتاج متابعة", en: "Needs attention" },
            bad: { c: "bg-rose-50 text-rose-700 border-rose-200", ar: "تجربة العملاء منخفضة", en: "Low customer experience" },
            none: { c: "bg-slate-50 text-slate-600 border-slate-200", ar: "بانتظار التحليل", en: "Waiting for analysis" },
          }[level];
          return (
            <button key={b.id} onClick={() => onOpen(b.id)}
              className={`text-start bg-white rounded-3xl p-6 border shadow-sm transition hover:shadow-md hover:border-blue-300 ${isCurrent ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200/80"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">{b.code}</div>
                  <div>
                    <p className="font-extrabold text-slate-900 text-sm">{isAr ? b.ar : b.en}</p>
                    <p className="text-[11px] text-slate-500">{isAr ? b.cityAr : b.cityEn}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${badge.c}`}>{isAr ? badge.ar : badge.en}</span>
                  {n.peak && <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700"><Flame size={12} />{t("وقت ذروة الآن", "Peak time now")}</span>}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-5">
                <Num label={t("مؤشر التجربة", "CX index")} value={cx === null ? "—" : `${cx}`} />
                <Num label={t("العملاء", "Customers")} value={`${n.customers}`} />
                <Num label={t("في الوقت", "On time")} value={n.onTime === null ? "—" : `${n.onTime}%`} />
              </div>

              <div className="flex items-center justify-between mt-5 text-[11px]">
                <span className={isLive ? "text-blue-700 font-bold" : "text-slate-400"}>
                  {isLive ? t("أرقام مباشرة من التحليل", "Live numbers from the analysis") : isCurrent ? t("الفرع الحالي · شغّلي فيديو لتظهر أرقامه", "Current branch · play a video to see its numbers") : t("بيانات تجريبية", "Sample data")}
                </span>
                <span className="flex items-center gap-1 font-bold text-blue-600">
                  {t("افتح لوحة الفرع", "Open branch dashboard")}
                  {isAr ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="flex items-center gap-2 text-[11px] text-slate-500">
        <Store size={13} />
        {t("كل فرع تظهر أرقامه من فيديوهات كاميراته بعد تحليلها. الفروع غير المحللة تعرض بيانات تجريبية.",
           "Each branch's numbers come from its own camera videos once analysed. Branches not analysed yet show sample data.")}
      </p>
    </div>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-3">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="text-lg font-black text-slate-900 mt-0.5"><span dir="ltr">{value}</span></p>
    </div>
  );
}
