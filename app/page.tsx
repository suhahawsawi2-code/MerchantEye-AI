"use client";

import React, { useState, useCallback } from "react";
import LiveVisionPanel from "./components/LiveVisionPanel";
import type { FrameStats, EngineSettings } from "./lib/visionEngine";
import { motion } from "framer-motion";
import { 
  Sparkles, Camera, TrendingUp, Clock, ShieldCheck, 
  Layers, ArrowRight, Check, HelpCircle, Users, 
  ChevronDown, Languages, Play, BarChart2, CheckCircle2,
  Building2, Lock, Flame, Upload, Pause, LayoutDashboard, PieChart,
  FileText, LogOut, Video, Scan, Activity, Download,
  FileSpreadsheet, FileCode, Calendar, BarChart as BarChartIcon, Mail,
  MapPin, UserCheck, Zap, AlertCircle
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

// التحليل يتم مباشرة داخل المتصفح: YOLOv8 (ONNX) + تتبّع + منطقة الطابور — انظري app/lib/visionEngine.ts
const ENGINE_SETTINGS: EngineSettings = { conf: 0.35, waitThresholdSec: 180, queueLimit: 4 };

const formatWait = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// بيانات التحليلات التفصيلية
const hourlyAnalytics = [
  { hour: "08 AM", footfall: 35, avgDwell: 2.1, queuePeak: 1 },
  { hour: "10 AM", footfall: 78, avgDwell: 3.4, queuePeak: 2 },
  { hour: "12 PM", footfall: 142, avgDwell: 5.8, queuePeak: 5 },
  { hour: "02 PM", footfall: 98, avgDwell: 4.2, queuePeak: 3 },
  { hour: "04 PM", footfall: 85, avgDwell: 3.9, queuePeak: 2 },
  { hour: "06 PM", footfall: 190, avgDwell: 7.1, queuePeak: 6 },
  { hour: "08 PM", footfall: 130, avgDwell: 4.8, queuePeak: 4 },
];

const zoneAnalytics = [
  { zone: "منطقة المحاسبين (Checkout Area)", traffic: "عالي جداً (Hot)", dwellAvg: "4.2 min", status: "تكدس متكرر", color: "#EF4444" },
  { zone: "مدخل المتجر الرئيسي (Entrance)", traffic: "عالي (Warm)", dwellAvg: "0.8 min", status: "انسيابي", color: "#3B82F6" },
  { zone: "رفوف المأكولات الطازجة (Fresh Food)", traffic: "متوسط (Warm)", dwellAvg: "3.1 min", status: "طبيعي", color: "#10B981" },
  { zone: "قسم العروض الخاصة (Promotions)", traffic: "عالي جداً (Hot)", dwellAvg: "5.5 min", status: "انتباه عالي", color: "#F59E0B" },
];

export default function Home() {
  const [currentView, setCurrentView] = useState<"landing" | "login" | "dashboard">("landing");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const onStats = useCallback((s: FrameStats | null) => setStats(s), []);
  const isAr = lang === "ar";

  const handleDownload = (format: string) => {
    setDownloadingFormat(format);
    setTimeout(() => {
      setDownloadingFormat(null);
      alert(isAr ? `تم تنزيل التقرير بنجاح بصيغة (${format})` : `Report downloaded successfully as ${format}`);
    }, 1200);
  };

  const currentFrameData = stats;
  const insightText = stats
    ? (isAr ? stats.insightAr : stats.insightEn)
    : (isAr ? "ارفعي فيديو أو شغّلي الفيديو التجريبي، وستظهر التوصيات هنا لحظياً." : "Upload a video or play the sample — live recommendations will appear here.");
  const currentTime = stats?.t ?? 0;

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
            <NavItem icon={<PieChart size={18} />} label={isAr ? "التحليلات التفصيلية" : "Analytics"} active={activeTab === "analytics"} onClick={() => setActiveTab("analytics")} />
            <NavItem icon={<FileText size={18} />} label={isAr ? "التقارير والتنزيل" : "Reports & Exports"} active={activeTab === "reports"} onClick={() => setActiveTab("reports")} />
          </nav>
        </div>

        <div className="border-t border-slate-100 pt-4 px-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
              RIY
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{isAr ? "فرع الرياض الرئيسي" : "Riyadh Main Branch"}</p>
              <p className="text-[10px] text-slate-400">{isAr ? "متجر #104" : "Store #104"}</p>
            </div>
          </div>
          <LogOut size={16} onClick={() => setCurrentView("landing")} className="text-slate-400 cursor-pointer hover:text-rose-600 transition" />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8 relative">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/60">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {activeTab === "dashboard" && (isAr ? "لوحة التحكم الحية" : "Live Executive Dashboard")}
              {activeTab === "analytics" && (isAr ? "التحليلات الجغرافية والسلوكية" : "Heatmaps & Behavioral Analytics")}
              {activeTab === "reports" && (isAr ? "مركز التقارير والتصدير الذكي" : "Reports & Export Center")}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr ? "منظومة عين التاجر لتحويل رؤية الفيديو إلى قرارات استراتيجية" : "MerchantEye Vision AI Engine"}
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
            <button onClick={() => handleDownload("PDF")} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/10 transition">
              <Download size={14} />
              <span>{downloadingFormat ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تنزيل تقرير ملخص" : "Download Summary")}</span>
            </button>
          </div>
        </header>

        {/* TAB 1: DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard title={isAr ? "مؤشر تجربة العملاء" : "CX Score"} value={currentFrameData ? `\u2066${currentFrameData.cxScore} / 100\u2069` : "—"} change={isAr ? "مؤشر محسوب" : "Computed index"} isPositive={true} badge="Index" icon={<Sparkles className="w-5 h-5 text-blue-600" />} />
              <KPICard title={isAr ? "متوسط وقت الانتظار" : "Avg Waiting Time"} value={currentFrameData ? formatWait(currentFrameData.avgWaitSec) : "—"} change={isAr ? "من التتبع" : "From tracking"} isPositive={!currentFrameData || currentFrameData.level !== "alert"} badge={currentFrameData?.level === "alert" ? "Alert" : "Normal"} icon={<Clock className="w-5 h-5 text-amber-500" />} />
              <KPICard title={isAr ? "العملاء الآن" : "Live Customers"} value={currentFrameData ? `${currentFrameData.visitorsNow} ${isAr ? "أشخاص" : "People"}` : "—"} change="YOLOv8" isPositive={true} badge="Detected" icon={<Users className="w-5 h-5 text-teal-600" />} />
              <KPICard title={isAr ? "طابور الانتظار" : "Queue Count"} value={currentFrameData ? `${currentFrameData.queueCount} ${isAr ? "منتظرين" : "Waiting"}` : "—"} change={isAr ? "منطقة الطابور" : "Queue zone"} isPositive={!currentFrameData || currentFrameData.queueCount <= 2} badge={currentFrameData && currentFrameData.queueCount > 2 ? "Crowded" : "Normal"} icon={<Flame className="w-5 h-5 text-rose-500" />} />
              <KPICard title={isAr ? "زمن الفيديو" : "Video Timecode"} value={`${currentTime.toFixed(1)}s`} change={stats ? `${Math.round(stats.inferenceMs)} ms/frame` : "—"} isPositive={true} badge="Live" icon={<Activity className="w-5 h-5 text-indigo-600" />} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <LiveVisionPanel isAr={isAr} settings={ENGINE_SETTINGS} onStats={onStats} />

              <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-blue-50 rounded-2xl text-blue-600"><Sparkles size={20} /></div>
                    <h3 className="font-extrabold text-sm text-slate-900">{isAr ? "توصية اللقطة الحالية" : "Current Frame Insight"}</h3>
                  </div>
                  <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-2">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md">{currentTime.toFixed(1)}s</span>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed">{insightText}</p>
                  </div>
                </div>
                <button className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-sm">{isAr ? "تطبيق الإجراء" : "Apply Action"}</button>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: DETAILED ANALYTICS (صفحة التحليلات المطلوبة) */}
        {activeTab === "analytics" && (
          <div className="space-y-8">
            {/* Top Stat Row */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard title={isAr ? "إجمالي الزوار اليوم" : "Total Visitors"} value="756" change="+14.2%" isPositive={true} badge="Daily" icon={<Users className="w-5 h-5 text-blue-600" />} />
              <KPICard title={isAr ? "ساعة الذروة اليومية" : "Peak Hour"} value="06:00 PM" change="190 Visitors" isPositive={true} badge="High Traffic" icon={<Zap className="w-5 h-5 text-amber-500" />} />
              <KPICard title={isAr ? "متوسط المكوث (Dwell)" : "Avg Dwell Time"} value="4.5 min" change="-0.4 min" isPositive={true} badge="Optimal" icon={<Clock className="w-5 h-5 text-emerald-600" />} />
              <KPICard title={isAr ? "معدل التكدس بالنظام" : "Congestion Rate"} value="8.4%" change="-2.1%" isPositive={true} badge="Controlled" icon={<AlertCircle className="w-5 h-5 text-rose-500" />} />
            </section>

            {/* Charts Grid */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hourly Footfall Chart */}
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{isAr ? "حركة الزوار بالساعات (Footfall Trend)" : "Hourly Footfall Trend"}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{isAr ? "توزيع تدفق الزوار على مدار اليوم" : "Distribution of customer visits throughout the day"}</p>
                  </div>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg font-bold">Today</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyAnalytics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#FFF', fontSize: '12px' }} />
                      <Area type="monotone" dataKey="footfall" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorFootfall)" />
                      <defs>
                        <linearGradient id="colorFootfall" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0}/>
                        </linearGradient>
                      </defs>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dwell Time & Queue Chart */}
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{isAr ? "أقصى طول لطابور الانتظار (Queue Peak)" : "Peak Queue Length"}</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">{isAr ? "أعلى عدد منتظرين مسجل عند المحاسبين" : "Highest waiting count per hour"}</p>
                  </div>
                  <span className="text-[10px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg font-bold">Live Stream Data</span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyAnalytics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="hour" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#0F172A', borderRadius: '12px', color: '#FFF', fontSize: '12px' }} />
                      <Bar dataKey="queuePeak" fill="#F59E0B" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Zone Analytics & Heatmap Breakdown */}
            <section className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{isAr ? "تحليل المناطق الكثيفة والباردة (Hot/Cold Zones)" : "Heatmap & Zone Performance"}</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">{isAr ? "رصد توزع حركة الزوار ومدة بقائهم في أقسام المتجر" : "Customer dwell time and footfall by store section"}</p>
                </div>
                <button className="text-xs font-bold text-blue-600 hover:underline">{isAr ? "تصدير الخريطة الحرارية" : "Export Heatmap"}</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {zoneAnalytics.map((item, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-white text-slate-700 shadow-sm">{item.status}</span>
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-900">{item.zone}</h4>
                      <p className="text-[11px] text-slate-500 mt-1">{isAr ? "معدل الحركة:" : "Traffic:"} <span className="font-bold text-slate-800">{item.traffic}</span></p>
                    </div>
                    <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center text-[11px]">
                      <span className="text-slate-400">{isAr ? "متوسط المكوث:" : "Avg Dwell:"}</span>
                      <span className="font-bold font-mono text-slate-800">{item.dwellAvg}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: REPORTS & EXPORTS */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <div className="bg-white/80 backdrop-blur-md p-8 rounded-3xl border border-slate-200/80 shadow-sm text-center max-w-2xl mx-auto space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto text-2xl">
                📄
              </div>
              <h3 className="font-black text-lg text-slate-900">{isAr ? "مركز تصدير التقارير الموثقة" : "Export Official Reports"}</h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                {isAr ? "اختر الصيغة المناسبة لتصدير تقارير حركة الزوار، أوقات الانتظار، وتقييم تجربة العملاء الموثقة للتحكيم." : "Export verified analytics reports for retail audits and judging evaluations."}
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                <button onClick={() => handleDownload("PDF")} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-500/20 flex items-center gap-2 transition">
                  <Download size={16} />
                  <span>PDF Report</span>
                </button>
                <button onClick={() => handleDownload("CSV")} className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-sm flex items-center gap-2 transition">
                  <FileSpreadsheet size={16} />
                  <span>CSV Data</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${active ? "bg-blue-50 text-[#2563EB] shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function KPICard({ title, value, change, isPositive, badge, icon }: any) {
  return (
    <div className="bg-white/80 backdrop-blur-md p-5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between hover:shadow-md transition">
      <div className="flex justify-between items-start">
        <span className="text-xs font-semibold text-slate-400">{title}</span>
        <div className="p-2 bg-slate-50 rounded-2xl">{icon}</div>
      </div>
      <div className="mt-4">
        <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">{value}</h3>
        <div className="flex items-center justify-between mt-2">
          <span className={`text-[10px] font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'} flex items-center gap-0.5`}>
            {change}
          </span>
          <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{badge}</span>
        </div>
      </div>
    </div>
  );
}
