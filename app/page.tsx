"use client";

import React, { useState, useCallback } from "react";
import LiveVisionPanel from "./components/LiveVisionPanel";
import JourneyPanel, { type ActiveJourneyData, type VideoJourneyFeed } from "./components/JourneyPanel";
import AnalyticsView from "./components/AnalyticsView";
import BranchesView, { BRANCHES } from "./components/BranchesView";
import { DEFAULT_JOURNEY_SETTINGS, type Invoice, type JourneySettings } from "./lib/journey";
import type { EngineSettings } from "./lib/visionEngine";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight, Languages, Play, CheckCircle2, LayoutDashboard, LogOut, PieChart, Store } from "lucide-react";

// التحليل يتم مباشرة داخل المتصفح: YOLOv8 (ONNX) + تتبّع + منطقة الطابور — انظري app/lib/visionEngine.ts
const ENGINE_SETTINGS: EngineSettings = { conf: 0.35, waitThresholdSec: 180, queueLimit: 4 };




export default function Home() {
  const [currentView, setCurrentView] = useState<"landing" | "login" | "dashboard">("landing");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [branchId, setBranchId] = useState(BRANCHES[0].id);
  const branch = BRANCHES.find((b) => b.id === branchId) ?? BRANCHES[0];
  const onStats = useCallback(() => {}, []);   // the per-frame queue numbers are no longer shown; the journey board replaces them
  const [journeyFeed, setJourneyFeed] = useState<VideoJourneyFeed | null>(null);
  const onJourneys = useCallback((f: VideoJourneyFeed | null) => setJourneyFeed(f), []);
  const [journeySettings, setJourneySettings] = useState<JourneySettings>(DEFAULT_JOURNEY_SETTINGS);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeData, setActiveData] = useState<ActiveJourneyData | null>(null);
  const isAr = lang === "ar";


  // 1️⃣ VIEW: LANDING PAGE
  if (currentView === "landing") {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#090D16] text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-blue-500 selection:text-white">
        
        {/* Background Glows */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-blue-600/20 via-teal-500/10 to-purple-600/20 blur-[120px] rounded-full"></div>
          <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full"></div>
        </div>

        {/* NAVBAR */}
        <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#090D16]/70 border-b border-slate-800/60 transition-all">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 via-teal-400 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/25">
                👁️
              </div>
              <span className="font-extrabold text-xl tracking-tight text-white">
                {isAr ? "عين التاجر" : "MerchantEye"} <span className="text-blue-400">AI</span>
              </span>
            </div>

            <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
              <button onClick={() => setCurrentView("dashboard")} className="hover:text-white transition">{isAr ? "اللوحة" : "Dashboard"}</button>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => setLang(isAr ? "en" : "ar")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-300 transition border border-slate-700/50"
              >
                <Languages size={15} className="text-blue-400" />
                <span>{isAr ? "English" : "العربية"}</span>
              </button>

              <button 
                onClick={() => setCurrentView("login")}
                className="hidden sm:inline-flex text-xs font-bold px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
              >
                {isAr ? "تسجيل الدخول" : "Sign In"}
              </button>

              <button 
                onClick={() => setCurrentView("dashboard")}
                className="text-xs font-bold px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition hover:scale-105"
              >
                {isAr ? "تجربة مجانية" : "Free Trial"}
              </button>
            </div>
          </div>
        </nav>

        {/* HERO SECTION */}
        <section className="relative z-10 pt-20 pb-24 px-6 max-w-7xl mx-auto text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold mb-8 backdrop-blur-md"
          >
            <Sparkles size={14} />
            <span>{isAr ? "نظام عين التاجر لذكاء تجربة العملاء" : "MerchantEye CX Intelligence Platform"}</span>
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-5xl mx-auto leading-[1.15]"
          >
            {isAr ? (
              <>حول كاميرات المراقبة إلى <span className="bg-gradient-to-r from-blue-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">منظومة ذكاء أعمال تجارية</span></>
            ) : (
              <>Transform CCTV Cameras into <span className="bg-gradient-to-r from-blue-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">Merchant Intelligence</span></>
            )}
          </motion.h1>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-slate-400 text-base sm:text-xl max-w-3xl mx-auto leading-relaxed font-normal"
          >
            {isAr 
              ? "استخدم عين التاجر لفهم سلوك العملاء، تقليل أوقات الانتظار، تحسين العمليات التشغيلية، وزيادة المبيعات — دون الحاجة لشراء كاميرات جديدة."
              : "Use MerchantEye AI to understand customer behavior, reduce waiting times, optimize operations, and boost sales without installing new cameras."}
          </motion.p>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button 
              onClick={() => setCurrentView("dashboard")}
              className="w-full sm:w-auto text-sm font-extrabold px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30 transition hover:scale-105 flex items-center justify-center gap-2"
            >
              <span>{isAr ? "ابدأ التجربة المجانية" : "Get Started Free"}</span>
              <ArrowRight size={18} className={isAr ? "rotate-180" : ""} />
            </button>

            <button 
              onClick={() => setCurrentView("dashboard")}
              className="w-full sm:w-auto text-sm font-bold px-8 py-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 backdrop-blur-md transition flex items-center justify-center gap-2"
            >
              <Play size={16} className="text-blue-400 fill-blue-400" />
              <span>{isAr ? "استعراض لوحة التحكم" : "Watch Demo"}</span>
            </button>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-12 flex flex-wrap items-center justify-center gap-8 text-xs font-semibold text-slate-400"
          >
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> {isAr ? "متوافق مع كل الكاميرات" : "Works with any CCTV hardware"}</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> {isAr ? "حماية وخصوصية 100%" : "100% Privacy Compliant"}</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-400" /> {isAr ? "ربط سريع في 15 دقيقة" : "15-minute Plug & Play Setup"}</span>
          </motion.div>
        </section>

        {/* FOOTER */}
        <footer className="py-12 px-6 border-t border-slate-800/80 bg-[#060911] text-slate-500 text-xs mt-20">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                👁️
              </div>
              <span className="font-bold text-white text-sm">{isAr ? "عين التاجر" : "MerchantEye AI"}</span>
            </div>
            <p>© 2026 MerchantEye AI Inc. All rights reserved.</p>
          </div>
        </footer>
      </div>
    );
  }

  // 2️⃣ VIEW: LOGIN SCREEN
  if (currentView === "login") {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden font-sans">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 backdrop-blur-xl space-y-6">
          <div className="flex justify-between items-center">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-2xl shadow-lg shadow-blue-500/20">
              👁️
            </div>
            <button onClick={() => setCurrentView("landing")} className="text-xs text-slate-400 hover:text-white">
              {isAr ? "← العودة للرئيسية" : "← Back"}
            </button>
          </div>
          <div>
            <h2 className="text-xl font-black text-white">{isAr ? "تسجيل الدخول — عين التاجر" : "Sign In — MerchantEye"}</h2>
            <p className="text-xs text-slate-400 mt-1">{isAr ? "منظومة تحليل ذكاء الأعمال ورؤية الكاميرات" : "Enterprise Retail Intelligence Dashboard"}</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setCurrentView("dashboard"); }} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">{isAr ? "البريد الإلكتروني" : "Email Address"}</label>
              <input type="email" required defaultValue="admin@merchanteye.ai" className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition" />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">{isAr ? "كلمة المرور" : "Password"}</label>
              <input type="password" required defaultValue="••••••••" className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 transition" />
            </div>
            <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-600/30 transition duration-200 mt-2">
              {isAr ? "الدخول إلى لوحة التحكم 🚀" : "Launch Dashboard 🚀"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 3️⃣ VIEW: DASHBOARD
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex h-screen bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden transition-all duration-300">
      
      {/* Sidebar */}
      <aside className="w-64 bg-white/80 backdrop-blur-xl border-r border-slate-200/80 flex flex-col justify-between p-5 z-20 shadow-sm">
        <div>
          <div className="flex items-center gap-3 px-2 py-3 mb-8">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 via-teal-400 to-indigo-500 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-500/20">
              👁️
            </div>
            <div>
              <h2 className="font-extrabold text-base text-slate-900 tracking-tight leading-tight">
                {isAr ? "عين التاجر" : "MerchantEye"}
              </h2>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                {isAr ? "ذكاء تجربة العملاء" : "CX Intelligence"}
              </p>
            </div>
          </div>

          <nav className="space-y-1.5">
            <NavItem icon={<LayoutDashboard size={18} />} label={isAr ? "اللوحة الرئيسية" : "Dashboard"} active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
            <NavItem icon={<Store size={18} />} label={isAr ? "الفروع" : "Branches"} active={activeTab === "branches"} onClick={() => setActiveTab("branches")} />
            <NavItem icon={<PieChart size={18} />} label={isAr ? "التحليلات" : "Analytics"} active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} />
          </nav>
        </div>

        <div className="border-t border-slate-100 pt-4 px-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
              {branch.code}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{isAr ? branch.ar : branch.en}</p>
              <p className="text-[10px] text-slate-400">{isAr ? branch.cityAr : branch.cityEn}</p>
            </div>
          </div>
          <LogOut size={16} onClick={() => setCurrentView("landing")} className="text-slate-400 cursor-pointer hover:text-rose-600 transition" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 space-y-5 relative">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200/60">
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              {activeTab === "branches" ? (isAr ? "الفروع" : "Branches") : activeTab === "analytics" ? (isAr ? "التحليلات" : "Analytics") : (isAr ? "لوحة تجربة العملاء" : "Customer Experience Dashboard")}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeTab === "branches"
                ? (isAr ? "كل فروعك في مكان واحد: تجربة العملاء وحالة كل فرع الآن" : "All your branches in one place: customer experience and status of each")
                : activeTab === "analytics"
                ? (isAr ? `${branch.ar} · أرقام ورسوم من رحلات العملاء التي طلعت من تحليل الفيديو` : `${branch.en} · charts from the customer journeys found in the video`)
                : (isAr ? `${branch.ar} · رحلة كل عميل من دخوله إلى خروجه، ووقت خدمته` : `${branch.en} · every customer's journey from entry to exit`)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentView("landing")} className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-xl text-xs font-bold text-slate-700 transition">
              {isAr ? "الرئيسية 🏠" : "Landing Page 🏠"}
            </button>
            <button onClick={() => setLang(isAr ? "en" : "ar")} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200/80 shadow-sm">
              <Languages size={16} className="text-blue-600" />
              <span>{isAr ? "English" : "العربية"}</span>
            </button>
          </div>
        </header>

        {/* TAB 1: DASHBOARD — stays mounted while hidden so a running video or simulation keeps going */}
        <div className={activeTab === "dashboard" ? "" : "hidden"}>
          <JourneyPanel isAr={isAr} video={journeyFeed} settings={journeySettings} onSettings={setJourneySettings} onInvoices={setInvoices} onActive={setActiveData}
            videoSlot={<LiveVisionPanel isAr={isAr} settings={ENGINE_SETTINGS} onStats={onStats} onJourneys={onJourneys} invoices={invoices} />} />
        </div>

        {/* BRANCHES */}
        {activeTab === "branches" && (
          <BranchesView isAr={isAr} current={branchId} data={activeData} settings={journeySettings}
            onOpen={(id) => { setBranchId(id); setActiveTab("dashboard"); }} />
        )}

        {/* TAB 2: ANALYTICS — built from the same journeys */}
        {activeTab === "analytics" && (
          <AnalyticsView isAr={isAr} data={activeData} settings={journeySettings} onGoToDashboard={() => setActiveTab("dashboard")} />
        )}

      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${active ? "bg-blue-50 text-[#2563EB] shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

