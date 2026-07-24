"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { 
  Sparkles, Camera, TrendingUp, Clock, ShieldCheck, 
  Layers, ArrowRight, Check, HelpCircle, Users, 
  ChevronDown, Languages, Play, BarChart2, CheckCircle2,
  Building2, Lock
} from "lucide-react";
import Link from "next/link";

export default function LandingPage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const isAr = lang === "ar";

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div 
      dir={isAr ? "rtl" : "ltr"}
      className="min-h-screen bg-[#090D16] text-slate-100 font-sans antialiased overflow-x-hidden selection:bg-blue-500 selection:text-white"
    >
      
      {/* Background Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-tr from-blue-600/20 via-teal-500/10 to-purple-600/20 blur-[120px] rounded-full"></div>
        <div className="absolute top-[40%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 blur-[150px] rounded-full"></div>
      </div>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#090D16]/70 border-b border-slate-800/60 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Logo Name: عين التاجر | MerchantEye AI */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 via-teal-400 to-indigo-500 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-500/25">
              👁️
            </div>
            <span className="font-extrabold text-xl tracking-tight text-white">
              {isAr ? "عين التاجر" : "MerchantEye"} <span className="text-blue-400">AI</span>
            </span>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition">{isAr ? "المميزات" : "Features"}</a>
            <a href="#how-it-works" className="hover:text-white transition">{isAr ? "كيف يعمل؟" : "How It Works"}</a>
            <a href="#preview" className="hover:text-white transition">{isAr ? "اللوحة" : "Dashboard"}</a>
            <a href="#pricing" className="hover:text-white transition">{isAr ? "الأسعار" : "Pricing"}</a>
            <a href="#faq" className="hover:text-white transition">{isAr ? "الأسئلة الشائعة" : "FAQ"}</a>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLang(isAr ? "en" : "ar")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-xs font-bold text-slate-300 transition border border-slate-700/50"
            >
              <Languages size={15} className="text-blue-400" />
              <span>{isAr ? "English" : "العربية"}</span>
            </button>

            <Link 
              href="/"
              className="hidden sm:inline-flex text-xs font-bold px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition"
            >
              {isAr ? "تسجيل الدخول" : "Sign In"}
            </Link>

            <Link 
              href="/"
              className="text-xs font-bold px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition hover:scale-105"
            >
              {isAr ? "تجربة مجانية" : "Free Trial"}
            </Link>
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
          <Link 
            href="/"
            className="w-full sm:w-auto text-sm font-extrabold px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/30 transition hover:scale-105 flex items-center justify-center gap-2"
          >
            <span>{isAr ? "ابدأ التجربة المجانية" : "Get Started Free"}</span>
            <ArrowRight size={18} className={isAr ? "rotate-180" : ""} />
          </Link>

          <a 
            href="#preview"
            className="w-full sm:w-auto text-sm font-bold px-8 py-4 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800 backdrop-blur-md transition flex items-center justify-center gap-2"
          >
            <Play size={16} className="text-blue-400 fill-blue-400" />
            <span>{isAr ? "استعراض لوحة التحكم" : "Watch Demo"}</span>
          </a>
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

          <p>© {new Date().getFullYear()} MerchantEye AI Inc. All rights reserved.</p>
        </div>
      </footer>

    </div>
  );
}
