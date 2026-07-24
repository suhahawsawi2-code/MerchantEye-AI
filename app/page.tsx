"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, Camera, TrendingUp, Clock, ShieldCheck, 
  Layers, ArrowRight, Check, HelpCircle, Users, 
  ChevronDown, Languages, Play, BarChart2, CheckCircle2,
  Building2, Lock, Flame, Upload, Pause, LayoutDashboard, PieChart,
  FileText, GitCompare, Settings, LogOut, Video, Scan, Activity, Download,
  FileSpreadsheet, FileCode, Calendar, BarChart as BarChartIcon, Mail
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

// بيانات محاكاة الفيديو
const videoTimelineData = [
  {
    startTime: 0,
    endTime: 3,
    cxScore: "96 / 100",
    waitTime: "1.2 min",
    visitorsNow: 3,
    queueCount: 1,
    boxes: [{ id: 101, label: "Customer #101", x: "20%", y: "30%", dwell: "0.8m", confidence: "99%", type: "green" }],
    insight: "انسيابية عالية جداً عند المدخل والمحاسب الرئيسي."
  },
  {
    startTime: 3,
    endTime: 7,
    cxScore: "92 / 100",
    waitTime: "2.4 min",
    visitorsNow: 5,
    queueCount: 2,
    boxes: [
      { id: 101, label: "Customer #101", x: "45%", y: "40%", dwell: "1.5m", confidence: "97%", type: "green" },
      { id: 102, label: "Queue #1", x: "70%", y: "55%", dwell: "2.1m", confidence: "94%", type: "blue" }
    ],
    insight: "بدأ تشكل طابور خفيف عند الكاونتر، أوقات الخدمة ضمن النطاق الممتاز."
  },
  {
    startTime: 7,
    endTime: 12,
    cxScore: "88 / 100",
    waitTime: "3.8 min",
    visitorsNow: 8,
    queueCount: 4,
    boxes: [
      { id: 101, label: "Customer #101", x: "50%", y: "35%", dwell: "2.8m", confidence: "98%", type: "green" },
      { id: 102, label: "Queue #1", x: "65%", y: "50%", dwell: "3.2m", confidence: "96%", type: "blue" },
      { id: 103, label: "Queue #2", x: "78%", y: "60%", dwell: "1.1m", confidence: "92%", type: "amber" }
    ],
    insight: "ارتفاع عدد المنتظرين إلى 4 أشخاص. يُنصح بالاستعداد لفتح كاونتر الإسراع."
  },
  {
    startTime: 12,
    endTime: 30,
    cxScore: "94 / 100",
    waitTime: "2.1 min",
    visitorsNow: 6,
    queueCount: 1,
    boxes: [
      { id: 104, label: "Customer #104", x: "30%", y: "45%", dwell: "1.0m", confidence: "99%", type: "green" },
      { id: 105, label: "Queue #1", x: "60%", y: "50%", dwell: "0.9m", confidence: "95%", type: "blue" }
    ],
    insight: "عودة أوقات الانتظار لمعدلاتها السريعة وتراجع الازدحام."
  }
];

const hourlyAnalytics = [
  { hour: "08 AM", footfall: 35, avgDwell: 2.1 },
  { hour: "10 AM", footfall: 78, avgDwell: 3.4 },
  { hour: "12 PM", footfall: 142, avgDwell: 5.8 },
  { hour: "02 PM", footfall: 98, avgDwell: 4.2 },
  { hour: "04 PM", footfall: 85, avgDwell: 3.9 },
  { hour: "06 PM", footfall: 190, avgDwell: 7.1 },
  { hour: "08 PM", footfall: 130, avgDwell: 4.8 },
];

export default function Home() {
  const [currentView, setCurrentView] = useState<"landing" | "login" | "dashboard">("landing");
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [downloadingFormat, setDownloadingFormat] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const isAr = lang === "ar";

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoSrc(URL.createObjectURL(file));
      setIsPlaying(true);
      setCurrentTime(0);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = (format: string) => {
    setDownloadingFormat(format);
    setTimeout(() => {
      setDownloadingFormat(null);
      alert(isAr ? `تم تنزيل التقرير بنجاح بصيغة (${format})` : `Report downloaded successfully as ${format}`);
    }, 1200);
  };

  const currentFrameData = videoTimelineData.find(
    (item) => currentTime >= item.startTime && currentTime < item.endTime
  ) || videoTimelineData[0];

  // 1️⃣ VIEW: LANDING PAGE (الواجهة الرئيسية)
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
              <a href="#features" className="hover:text-white transition">{isAr ? "المميزات" : "Features"}</a>
              <a href="#how-it-works" className="hover:text-white transition">{isAr ? "كيف يعمل؟" : "How It Works"}</a>
              <a href="#preview" className="hover:text-white transition">{isAr ? "اللوحة" : "Dashboard"}</a>
              <a href="#pricing" className="hover:text-white transition">{isAr ? "الأسعار" : "Pricing"}</a>
              <a href="#faq" className="hover:text-white transition">{isAr ? "الأسئلة الشائعة" : "FAQ"}</a>
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

  // 2️⃣ VIEW: LOGIN SCREEN (تسجيل الدخول)
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

  // 3️⃣ VIEW: DASHBOARD (لوحة التحكم التنفيذية)
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
            <NavItem icon={<GitCompare size={18} />} label={isAr ? "مقارنة الفروع" : "Branches"} active={activeTab === "branches"} onClick={() => setActiveTab("branches")} />
            <NavItem icon={<Settings size={18} />} label={isAr ? "الإعدادات" : "Settings"} active={activeTab === "settings"} onClick={() => setActiveTab("settings")} />
          </nav>
        </div>

        <div className="border-t border-slate-100 pt-4 px-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
              RIY
            </div>
            <div>
              <p className="text-xs font-bold text-slate-800">{isAr ? "فرع المدينة الرئيسي" : "Riyadh Main Branch"}</p>
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

        {activeTab === "dashboard" && (
          <div className="space-y-8">
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard title={isAr ? "مؤشر تجربة العملاء" : "CX Score"} value={currentFrameData.cxScore} change="Live" isPositive={true} badge="Live" icon={<Sparkles className="w-5 h-5 text-blue-600" />} />
              <KPICard title={isAr ? "متوسط وقت الانتظار" : "Avg Waiting Time"} value={currentFrameData.waitTime} change="Auto Sync" isPositive={true} badge="Realtime" icon={<Clock className="w-5 h-5 text-amber-500" />} />
              <KPICard title={isAr ? "العملاء الآن" : "Live Customers"} value={`${currentFrameData.visitorsNow} ${isAr ? "أشخاص" : "People"}`} change="Vision AI" isPositive={true} badge="Detected" icon={<Users className="w-5 h-5 text-teal-600" />} />
              <KPICard title={isAr ? "طابور الانتظار" : "Queue Count"} value={`${currentFrameData.queueCount} ${isAr ? "منتظرين" : "Waiting"}`} change="Camera Stream" isPositive={currentFrameData.queueCount <= 2} badge={currentFrameData.queueCount > 2 ? "Crowded" : "Normal"} icon={<Flame className="w-5 h-5 text-rose-500" />} />
              <KPICard title={isAr ? "زمن الفيديو" : "Video Timecode"} value={`${currentTime.toFixed(1)}s`} change="In Sync" isPositive={true} badge="Active" icon={<Activity className="w-5 h-5 text-indigo-600" />} />
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Scan size={18} className="text-blue-600 animate-pulse" />
                    {isAr ? "شاشة التحليل الحركي المباشر" : "Dynamic AI Vision Feed"}
                  </h2>
                  <label className="cursor-pointer flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition shadow-sm">
                    <Upload size={14} />
                    <span>{isAr ? "رفع فيديو MP4" : "Upload Custom MP4"}</span>
                    <input type="file" accept="video/mp4,video/m4v" onChange={handleVideoUpload} className="hidden" />
                  </label>
                </div>

                <div className="relative w-full h-80 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner group">
                  {videoSrc ? (
                    <video ref={videoRef} src={videoSrc} autoPlay loop muted playsInline onTimeUpdate={handleTimeUpdate} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-center space-y-2 z-10 p-6">
                      <Video size={32} className="mx-auto text-blue-400" />
                      <p className="text-xs font-mono font-bold text-slate-300">{isAr ? "قم برفع فيديو MP4 لرؤية التتبع المباشر" : "Upload an MP4 video to test live dynamic tracking"}</p>
                    </div>
                  )}

                  <div className="absolute inset-0 pointer-events-none z-20">
                    <AnimatePresence>
                      {currentFrameData.boxes.map((box) => (
                        <motion.div key={box.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1, left: box.x, top: box.y }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.5 }} style={{ position: "absolute" }} className={`w-28 h-36 border-2 rounded-2xl p-2 flex flex-col justify-between backdrop-blur-[2px] ${box.type === "green" ? "border-emerald-400 bg-emerald-500/15" : box.type === "blue" ? "border-blue-500 bg-blue-500/15" : "border-amber-400 bg-amber-500/15"}`}>
                          <div className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md w-max shadow ${box.type === "green" ? "bg-emerald-500 text-slate-950" : "bg-blue-600 text-white"}`}>{box.label}</div>
                          <div className="bg-slate-950/85 text-slate-200 text-[9px] font-mono p-1 rounded">Dwell: {box.dwell}</div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {videoSrc && (
                    <button onClick={togglePlay} className="absolute bottom-4 right-4 z-30 p-2.5 rounded-xl bg-slate-900/80 text-white border border-slate-700">
                      {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 bg-blue-50 rounded-2xl text-blue-600"><Sparkles size={20} /></div>
                    <h3 className="font-extrabold text-sm text-slate-900">{isAr ? "توصية اللقطة الحالية" : "Current Frame Insight"}</h3>
                  </div>
                  <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-2">
                    <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-md">{currentTime.toFixed(1)}s</span>
                    <p className="text-xs font-semibold text-slate-800 leading-relaxed">{currentFrameData.insight}</p>
                  </div>
                </div>
                <button className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-bold shadow-sm">{isAr ? "تطبيق الإجراء" : "Apply Action"}</button>
              </div>
            </section>
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
