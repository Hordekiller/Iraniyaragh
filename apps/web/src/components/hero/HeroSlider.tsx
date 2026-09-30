import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toPersianDigits } from '../../lib/format'
import { usePrefersReducedMotion } from '../../lib/reduced-motion'
import { SECTION_IDS } from '../../lib/site-config'
import { ROUTES } from '../../lib/routes'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogCategory } from '../../services/catalog/types'

const SLIDE_INTERVAL_MS = 5000
const SLIDE_LIMIT = 3

/**
 * Presentation-only treatments cycled across the slides. The slide content
 * itself (name, product count, destination) always comes from the live catalog,
 * so no category name, slug or count is hardcoded in the storefront.
 */
const TREATMENTS = [
  { gradient: 'from-[#0F172A]/90 via-[#0F172A]/60 to-transparent' },
  { gradient: 'from-[#7c2d12]/85 via-[#0F172A]/55 to-transparent' },
  { gradient: 'from-[#064e3b]/85 via-[#0F172A]/50 to-transparent' },
] as const

type HeroSlide = {
  id: string
  badge: string
  title: string
  highlight: string
  desc: string
  cta: string
  image: string
  gradient: string
  ctaSlug: string
}

function toSlides(categories: readonly CatalogCategory[]): HeroSlide[] {
  return categories
    .filter(category => category.productCount > 0)
    .slice(0, SLIDE_LIMIT)
    .map((category, index) => ({
      id: category.id,
      badge: 'دسته‌بندی فروشگاه',
      title: category.name,
      highlight: `${toPersianDigits(category.productCount)} کالا`,
      desc: `قیمت و موجودی ${category.name} به‌صورت زنده از فروشگاه نمایش داده می‌شود.`,
      cta: 'مشاهده دسته',
      image: category.image,
      gradient: TREATMENTS[index % TREATMENTS.length].gradient,
      ctaSlug: category.slug,
    }))
}

function slideCounter(current: number, total: number): string {
  const pad = (n: number) => toPersianDigits(String(n).padStart(2, '0'))
  return `${pad(current + 1)} / ${pad(total)}`
}

export function HeroSlider() {
  const api = useCatalogApi()
  const [categories, setCategories] = useState<CatalogCategory[] | null>(null)
  const [activeSlide, setActiveSlide] = useState(0)
  const [interactionPaused, setInteractionPaused] = useState(false)
  const [manuallyPaused, setManuallyPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    setCategories(null)
    setLoadError(false)
    setAttempt(n => n + 1)
  }
  const navigate = useNavigate()

  const heroSlides = useMemo(() => (categories ? toSlides(categories) : []), [categories])

  useEffect(() => {
    let cancelled = false
    api
      .listCategories()
      .then(list => {
        if (!cancelled) setCategories(list)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  // A shrinking catalog (e.g. a category removed) must not leave the index dangling.
  const current = heroSlides.length === 0 ? 0 : Math.min(activeSlide, heroSlides.length - 1)

  const autoplayStopped = reducedMotion || manuallyPaused || interactionPaused || heroSlides.length < 2
  const permanentlyPaused = reducedMotion || manuallyPaused

  useEffect(() => {
    if (autoplayStopped) return
    const id = setInterval(() => setActiveSlide(s => (s + 1) % heroSlides.length), SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [autoplayStopped, heroSlides.length])

  return (
    <section id={SECTION_IDS.home} aria-label="اسلایدر دسته‌بندی‌های فروشگاه" className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-4 lg:pt-6">
      <div
        onMouseEnter={() => setInteractionPaused(true)}
        onMouseLeave={() => setInteractionPaused(false)}
        onFocusCapture={() => setInteractionPaused(true)}
        onBlurCapture={() => setInteractionPaused(false)}
        className="relative overflow-hidden rounded-[24px] lg:rounded-[28px] bg-[#0F172A] h-[440px] lg:h-[520px]"
      >
        {heroSlides.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
            {loadError ? (
              <div role="alert" className="text-white/80">
                <p className="text-sm font-bold">بارگذاری دسته‌بندی‌ها با خطا مواجه شد.</p>
                <button
                  type="button"
                  onClick={retry}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-full border border-white/25 bg-white/10 px-5 text-[13px] font-bold text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  تلاش دوباره
                </button>
              </div>
            ) : (
              <p role="status" className="text-white/70 text-sm">
                {categories === null ? 'در حال بارگذاری دسته‌بندی‌ها...' : 'هنوز دسته‌بندی فعالی در فروشگاه ثبت نشده است.'}
              </p>
            )}
          </div>
        ) : (
        <>
        <AnimatePresence mode="wait">
          {reducedMotion ? (
            <div key={current} className="absolute inset-0">
              <img src={heroSlides[current].image} alt={heroSlides[current].title} className="absolute inset-0 w-full h-full object-cover" />
              <div className={`absolute inset-0 bg-gradient-to-l ${heroSlides[current].gradient}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent lg:from-black/30" />
            </div>
          ) : (
            <motion.div
              key={current}
              initial={{ opacity: 0, scale: 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute inset-0"
            >
              <img src={heroSlides[current].image} alt={heroSlides[current].title} className="absolute inset-0 w-full h-full object-cover" />
              <div className={`absolute inset-0 bg-gradient-to-l ${heroSlides[current].gradient}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent lg:from-black/30" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hero Content */}
        <div className="relative h-full flex flex-col justify-center px-6 lg:px-14 py-10 lg:py-0">
          <motion.div
            key={'content-' + current}
            initial={reducedMotion ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reducedMotion ? 0 : 0.25, duration: reducedMotion ? 0 : 0.6 }}
            className="max-w-[620px]"
          >
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-xs font-bold">
              {reducedMotion ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )} {heroSlides[current].badge}
            </span>
            <h1 className="mt-4 text-white font-black leading-[1.05] text-[30px] lg:text-[48px]">
              {heroSlides[current].title}
              <span className="block text-white/90 font-extrabold text-[24px] lg:text-[36px] mt-1">{heroSlides[current].highlight}</span>
            </h1>
            <p className="mt-4 text-white/85 text-[13.5px] lg:text-[15px] leading-7 max-w-[520px] font-medium">
              {heroSlides[current].desc}
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <button type="button" onClick={() => navigate(ROUTES.category(heroSlides[current].ctaSlug))} className="h-12 px-7 rounded-full bg-[#C2410C] text-white font-extrabold text-sm hover:bg-[#A83509] transition flex items-center gap-2 shadow-lg shadow-[#C2410C]/25">
                {heroSlides[current].cta} <ArrowLeft size={18} className="bg-white/20 rounded-full p-0.5" />
              </button>
            </div>
          </motion.div>
        </div>

        {/* Slider Controls */}
        <div className="absolute bottom-6 right-6 lg:right-auto lg:left-6 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/25 backdrop-blur-xl border border-white/15 rounded-full p-1.5">
            <button type="button" onClick={() => setActiveSlide(s => (s - 1 + heroSlides.length) % heroSlides.length)} aria-label="اسلاید قبلی" className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronRight size={18} /></button>
            <button type="button" onClick={() => setActiveSlide(s => (s + 1) % heroSlides.length)} aria-label="اسلاید بعدی" className="w-8 h-8 lg:w-9 lg:h-9 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"><ChevronLeft size={18} /></button>
          </div>
          <button
            type="button"
            onClick={() => setManuallyPaused(p => !p)}
            aria-pressed={permanentlyPaused}
            aria-label={permanentlyPaused ? 'ادامه چرخش خودکار' : 'توقف چرخش خودکار'}
            disabled={reducedMotion}
            className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-100 transition"
          >
            {permanentlyPaused ? <Play size={18} /> : <Pause size={18} />}
          </button>
          <div role="group" aria-label="انتخاب اسلاید" className="flex items-center gap-2 bg-black/30 backdrop-blur-md rounded-full px-3 py-2">
            {heroSlides.map((_, i) => (
              <button
                type="button"
                key={i}
                onClick={() => setActiveSlide(i)}
                aria-label={`اسلاید ${i + 1}`}
                aria-current={current === i ? 'true' : undefined}
                // The pill stays visually small, but the button keeps a 32px
                // touch target (WCAG 2.5.8) without moving anything else.
                className="flex h-8 w-8 shrink-0 items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={`transition-all duration-300 ${current === i ? 'w-8 h-2.5 bg-[#FF4D00] rounded-full' : 'w-2.5 h-2.5 bg-white/50 rounded-full'}`}
                />
              </button>
            ))}
            <span className="mr-2 text-white/90 text-xs font-bold tabular-nums">{slideCounter(current, heroSlides.length)}</span>
          </div>
        </div>
        </>
        )}
      </div>
    </section>
  )
}