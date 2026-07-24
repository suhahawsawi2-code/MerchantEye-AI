"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, Clock, Users, Flame, Upload, Play, Pause, 
  CheckCircle2, ArrowUpRight, ArrowDownRight, 
  LayoutDashboard, PieChart, FileText, GitCompare, Settings, 
  LogOut, Languages, Video, Scan, Activity, Download, FileSpreadsheet, FileCode,
  Calendar, Filter, TrendingUp, Zap, ShieldCheck, BarChart as BarChartIcon
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

// بيانات محاكاة الفيديو الديناميكية
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

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="flex h-screen bg-[#F8FAFC] text-slate-800 font-sans overflow-hidden transition-all duration-300">
      
      {/* 1. الشريط الجانبي */}
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
          <LogOut size={16} className="text-slate-400 cursor-pointer hover:text-slate-600 transition" />
        </div>
      </aside>

      {/* 2. المحتوى الرئيسي حسب التبويب */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8 relative">
        
        {/* الهيدر العلوي */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200/60">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {activeTab === "dashboard" && (isAr ? "لوحة التحكم الحية" : "Live Executive Dashboard")}
              {activeTab === "analytics" && (isAr ? "التحليلات الجغرافية والسلوكية" : "Heatmaps & Behavioral Analytics")}
              {activeTab === "reports" && (isAr ? "مركز التقارير والتصدير الذكي" : "Reports & Export Center")}
              {activeTab === "branches" && (isAr ? "مقارنة أداء الفروع" : "Branch Comparison")}
              {activeTab === "settings" && (isAr ? "إعدادات الكاميرات والـ AI" : "AI & Camera Settings")}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr ? "منظومة عين التاجر لتحويل رؤية الفيديو إلى قرارات استراتيجية" : "MerchantEye Vision AI Engine"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button 
              onClick={() => setLang(isAr ? "en" : "ar")}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200/80 shadow-sm"
            >
              <Languages size={16} className="text-blue-600" />
              <span>{isAr ? "English" : "العربية"}</span>
            </button>

            {/* زر التنزيل السريع في الهيدر */}
            <button 
              onClick={() => handleDownload("PDF")}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-blue-500/10 transition"
            >
              <Download size={14} />
              <span>{downloadingFormat ? (isAr ? "جاري التصدير..." : "Exporting...") : (isAr ? "تنزيل تقرير ملخص" : "Download Summary")}</span>
            </button>
          </div>
        </header>

        {/* 🏠 TAB 1: DASHBOARD */}
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
                  <div>
                    <h2 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Scan size={18} className="text-blue-600 animate-pulse" />
                      {isAr ? "شاشة التحليل الحركي المباشر" : "Dynamic AI Vision Feed"}
                    </h2>
                  </div>
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
                        <motion.div
                          key={box.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1, left: box.x, top: box.y }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.5 }}
                          style={{ position: "absolute" }}
                          className={`w-28 h-36 border-2 rounded-2xl p-2 flex flex-col justify-between backdrop-blur-[2px] ${
                            box.type === "green" ? "border-emerald-400 bg-emerald-500/15" : box.type === "blue" ? "border-blue-500 bg-blue-500/15" : "border-amber-400 bg-amber-500/15"
                          }`}
                        >
                          <div className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md w-max shadow ${box.type === "green" ? "bg-emerald-500 text-slate-950" : "bg-blue-600 text-white"}`}>
                            {box.label}
                          </div>
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

        {/* 📊 TAB 2: DETAILED ANALYTICS (التحليلات التفاعلية) */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* الخريطة الحرارية المباشرة (Heatmap Simulation) */}
              <div className="lg:col-span-2 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{isAr ? "الخريطة الحرارية لكثافة التواجد (Store Heatmap)" : "Live Store Spatial Heatmap"}</h3>
                    <p className="text-xs text-slate-400">{isAr ? "تحليل المناطق الأكثر كفاءة وازدحاماً داخل الصالة" : "Visualizing high-dwell vs fast-moving store zones"}</p>
                  </div>
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-xl">{isAr ? "تحديث مباشر" : "Live Visual"}</span>
                </div>

                <div className="relative w-full h-72 bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 p-4 flex flex-col justify-between">
                  {/* Simulated Heatmap Zones */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-rose-500/40 via-amber-500/20 to-transparent"></div>
                  <div className="absolute bottom-10 left-10 w-40 h-40 bg-teal-500/30 rounded-full blur-2xl"></div>

                  <div className="z-10 flex justify-between items-start">
                    <span className="bg-slate-950/80 text-rose-400 border border-rose-500/30 text-[10px] font-mono px-2.5 py-1 rounded-lg">
                      {isAr ? "منطقة الكاونتر: كثافة عالية (Hot Zone)" : "Checkout Counter: Hot Zone"}
                    </span>
                    <span className="bg-slate-950/80 text-teal-400 border border-teal-500/30 text-[10px] font-mono px-2.5 py-1 rounded-lg">
                      {isAr ? "منطقة المدخل: انسيابية ممتازة" : "Entrance: Smooth Flow"}
                    </span>
                  </div>

                  <div className="z-10 flex justify-between items-end text-[11px] text-slate-400 font-mono">
                    <span>{isAr ? "معدل البقاء: 3.8 دقيقة" : "Avg Dwell: 3.8 mins"}</span>
                    <span>{isAr ? "مستوى التغطية: 100%" : "Camera Coverage: 100%"}</span>
                  </div>
                </div>
              </div>

              {/* تحليلات التوزيع الساعي */}
              <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
                <h3 className="font-bold text-sm text-slate-900">{isAr ? "حجم الزوار بالساعة" : "Hourly Visitor Volume"}</h3>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyAnalytics}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="hour" fontSize={10} stroke="#94A3B8" />
                      <YAxis fontSize={10} stroke="#94A3B8" />
                      <Tooltip />
                      <Bar dataKey="footfall" fill="#2563EB" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 📂 TAB 3: REPORTS & EXPORTS (قسم التقارير والتنزيل) */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            
            <div className="bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{isAr ? "مركز التقارير الموثقة" : "Automated Reports Center"}</h3>
                  <p className="text-xs text-slate-400">{isAr ? "تصدير التقارير القيادية المجهزة للطباعة أو للربط مع أنظمة ERP" : "Download executive PDF summaries or raw data exports"}</p>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 flex items-center gap-1"><Calendar size={14} /> {isAr ? "اليوم" : "Today"}</span>
                </div>
              </div>

              {/* خيارات تنزيل التقارير التفاعلية */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                
                <ReportExportCard 
                  title={isAr ? "تقرير ملخص الأداء القيادي (Executive Summary)" : "Executive CX Summary"}
                  format="PDF"
                  desc={isAr ? "شامل لمؤشر الرضا، أوقات الانتظار، وتوصيات الذكاء الاصطناعي." : "Complete PDF report with graphs, wait times, and AI recommendations."}
                  icon={<FileCode className="text-rose-500" size={24} />}
                  onDownload={() => handleDownload("PDF")}
                  isAr={isAr}
                />

                <ReportExportCard 
                  title={isAr ? "بيانات حركة الزوار الخام (Footfall Data)" : "Raw Footfall Data"}
                  format="CSV / Excel"
                  desc={isAr ? "بيانات مفصلة بالساعة والدقيقة متوافقة مع Excel وتطبيقات BI." : "Granular minute-by-minute visitor counts for BI tools."}
                  icon={<FileSpreadsheet className="text-emerald-500" size={24} />}
                  onDownload={() => handleDownload("CSV")}
                  isAr={isAr}
                />

                <ReportExportCard 
                  title={isAr ? "تقرير مقارنة الفروع والكفاءة" : "Branch Efficiency Report"}
                  format="PDF / JSON"
                  desc={isAr ? "مقارنة كفاءة الفروع وسرعة الخدمة ومعدلات التردد." : "Comparative performance benchmarks across branch locations."}
                  icon={<BarChartIcon size={24} className="text-blue-500" />}
                  onDownload={() => handleDownload("Excel")}
                  isAr={isAr}
                />

              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}

// Subcomponents
function NavItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
        active ? "bg-blue-50 text-[#2563EB] shadow-sm font-bold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
      }`}
    >
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
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />} {change}
          </span>
          <span className="text-[9px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{badge}</span>
        </div>
      </div>
    </div>
  );
}

function ReportExportCard({ title, format, desc, icon, onDownload, isAr }: any) {
  return (
    <div className="p-5 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:bg-slate-50 transition flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm">{icon}</div>
          <span className="text-[10px] font-extrabold bg-blue-100 text-blue-800 px-2.5 py-1 rounded-md">{format}</span>
        </div>
        <h4 className="font-bold text-xs text-slate-900 leading-snug">{title}</h4>
        <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
      </div>

      <button onClick={onDownload} className="w-full py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition">
        <Download size={14} className="text-blue-600" />
        <span>{isAr ? "تحميل التقرير الأن" : "Download File"}</span>
      </button>
    </div>
  );
}
  
   
