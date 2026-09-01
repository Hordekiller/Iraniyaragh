import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Play, Star } from 'lucide-react'
import { heroSlides, heroTrustPoints, quickStats } from '../../data/prototype'
import { useToast } from '../feedback/toast-context'

const SLIDE_INTERVAL_MS = 5000

export function HeroSlider() {
  const [activeSlide, setActiveSlide] = useState(0)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const { show } = useToast()

  useEffect(() => {
    if (interactionPaused) return
    const id = setInterval(() => setActiveSlide(s => (s + 1) % heroSlides.length), SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [interactionPaused])

  return (
    <section id="home" aria-label="اسلایدر پیشنهاد ویژه" className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4 lg:pt-6">
      <div
        onMouseEnter={() => setInteractionPaused(true)}
        onMouseLeave={() => setInteractionPaused(false)}
        onFocusCapture={() => setInteractionPaused(true)}
        onBlurCapture={() => setInteractionPaused(false)}
        className="relative overflow-hidden rounded-[24px] lg:rounded-[28px] bg-[#0F172A] h-[480px] lg:h-[520px]"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSlide}
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="absolute inset-0"
          >
            <img src={heroSlides[activeSlide].image} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className={`absolute inset-0 bg-gradient-to-l ${heroSlides[activeSlide].gradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent lg:from-black/30" />
          </motion.div>
        </AnimatePresence>

        {/* Hero Content */}
        <div className="relative h-full flex flex-col justify-center px-6 lg:px-14 py-10 lg:py-0">
          <motion.div
            key={'content-' + activeSlide}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
            className="max-w-[620px]"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> {heroSlides[activeSlide].badge}
            </span>
            <h1 className="mt-4 text-white font-black leading-[1.05] text-[30px] lg:text-[48px]">
              {heroSlides[activeSlide].title}
              <span className="block text-white/90 font-extrabold text-[24px] lg:text-[36px] mt-1">{heroSlides[activeSlide].highlight}</span>
            </h1>
            <p className="mt-4 text-white/85 text-[13.5px] lg:text-[15px] leading-7 max-w-[520px] font-medium">
              {heroSlides[activeSlide].desc}
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <button onClick={() => show('رفتن به جشنواره')} className="h-12 px-7 rounded-full bg-[#FF4D00] text-white font-extrabold text-sm hover:bg-[#e64500] transition flex items-center gap-2 shadow-lg shadow-[#FF4D00]/25">
                {heroSlides[activeSlide].cta} <ArrowLeft size={18} className="bg-white/20 rounded-full p-0.5" />
              </button>
              <button onClick={() => show('دانلود کاتالوگ')} className="h-12 px-6 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-bold text-sm hover:bg-white hover:text-slate-900 transition flex items-center gap-2">
                <Play size={16} className="fill-current" /> {heroSlides[activeSlide].cta2}
              </button>
            </div>
            <div className="hidden lg:flex items-center gap-6 mt-8 text-white/90 text-xs">
              {heroTrustPoints.map(point => (
                <span key={point.label} className="flex items-center gap-2"><point.icon size={16} className="text-emerald-400" /> {point.label}</span>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Slider Controls */}
        <div className="absolute bottom-6 right-6 lg:right-auto lg:left-6 flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 bg-black/25 backdrop-blur-xl border border-white/15 rounded-full p-1.5">
            <button onClick={() => setActiveSlide(s => (s - 1 + heroSlides.length) % heroSlides.length)} aria-label="اسلاید قبلی" className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronRight size={18} /></button>
            <button onClick={() => setActiveSlide(s => (s + 1) % heroSlides.length)} aria-label="اسلاید بعدی" className="w-9 h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronLeft size={18} /></button>
          </div>
          <div role="group" aria-label="انتخاب اسلاید" className="flex items-center gap-2 bg-black/30 backdrop-blur-md rounded-full px-3 py-2">
            {heroSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveSlide(i)}
                aria-label={`اسلاید ${i + 1}`}
                aria-current={activeSlide === i ? 'true' : undefined}
                className={`transition-all duration-300 ${activeSlide === i ? 'w-8 h-2.5 bg-[#FF4D00] rounded-full' : 'w-2.5 h-2.5 bg-white/50 rounded-full hover:bg-white'}`}
              />
            ))}
            <span className="mr-2 text-white/90 text-xs font-bold tabular-nums">۰{activeSlide + 1} / ۰۳</span>
          </div>
        </div>

        {/* Left Promo Card - Desktop */}
        <div className="hidden lg:block absolute top-6 left-6 w-[300px]">
          <div className="rounded-[20px] bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">پیشنهاد امروز</span>
              <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center gap-1"><Flame size={12} /> حراج</span>
            </div>
            <div className="flex gap-3 mt-3">
              <img src="/images/tool2.jpg" alt="دریل بتن‌کن رونیکس 2701" className="w-20 h-20 rounded-2xl object-cover bg-slate-50" />
              <div className="flex-1">
                <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2">دریل بتن‌کن رونیکس 2701 + هدیه</div>
                <div className="flex items-center gap-1 mt-1"><Star size={12} className="fill-amber-400 text-amber-400" /><span className="text-xs font-bold">۴.۹</span><span className="text-xs text-slate-400">(۲۱۲)</span></div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-[#FF4D00] font-black text-[15px]">۵,۱۲۰,۰۰۰</span><span className="text-xs text-slate-400 line-through">۶,۴۰۰,۰۰۰</span>
                </div>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full w-[68%] bg-[#FF4D00] rounded-full" />
            </div>
            <div className="flex justify-between mt-1.5 text-[11px] font-medium text-slate-500"><span>فروخته شده ۶۸٪</span><span>باقی‌مانده ۳۲ عدد</span></div>
          </div>
        </div>
      </div>

      {/* Tiny Stats under hero - mobile */}
      <div className="grid grid-cols-3 gap-2 mt-3 lg:hidden">
        {quickStats.map(s => (
          <div key={s.k} className="bg-white rounded-2xl py-3 text-center border border-slate-100">
            <div className="text-[11px] text-slate-500 font-medium">{s.k}</div>
            <div className="text-[13px] font-black text-slate-900">{s.v}</div>
          </div>
        ))}
      </div>
    </section>
  )
}