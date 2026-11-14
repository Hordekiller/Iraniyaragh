import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import type { HomepageBannerPublic } from '@iranyaragh/contracts'
import { ROUTES } from '../../lib/routes'
import { SITE_TAGLINE } from '../../lib/site-config'

// Reuse the archived storefront artwork with truthful discovery copy.
const fallback: HomepageBannerPublic[] = [
  { id: 'cabinet-hinge', title: 'لولا و یراق کابینت', subtitle: 'برای انتخاب دقیق یراق کابینت، کالاها و مشخصات ثبت‌شده را ببینید.', ctaLabel: 'مشاهده کالاها', href: ROUTES.search, imageAlt: 'لولای آرام‌بند روی درب کابینت چوبی', desktopImage: { url: '/images/cabinet-hinge-hero.webp', width: 1672, height: 941 }, mobileImage: null },
  { id: 'cabinet-drawer', title: 'ریل کشو و حرکت نرم', subtitle: 'انواع ریل و تجهیزات کشو را در فروشگاه بررسی کنید.', ctaLabel: 'جستجوی ریل کشو', href: '/search?q=%D8%B1%DB%8C%D9%84%20%DA%A9%D8%B4%D9%88', imageAlt: 'ریل فلزی کشوی کابینت چوبی', desktopImage: { url: '/images/cabinet-drawer-hero.webp', width: 1672, height: 941 }, mobileImage: null },
  { id: 'cabinet-handle', title: 'دستگیره‌های کابینت', subtitle: 'مدل‌های دستگیره را با تصاویر و مشخصات هر کالا مقایسه کنید.', ctaLabel: 'جستجوی دستگیره', href: '/search?q=%D8%AF%D8%B3%D8%AA%DA%AF%DB%8C%D8%B1%D9%87', imageAlt: 'دستگیره‌های برنجی روی کشوهای کابینت چوبی', desktopImage: { url: '/images/cabinet-handle-hero.webp', width: 1672, height: 941 }, mobileImage: null },
]

export function HeroSlider({ banners }: { banners?: HomepageBannerPublic[] } = {}) {
  const slides = banners ?? fallback
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [manualPlay, setManualPlay] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reducedMotion, setReducedMotion] = useState(true)
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => { setReducedMotion(preference.matches); if (preference.matches) setPaused(true) }
    const visibility = () => setVisible(document.visibilityState === 'visible')
    update()
    visibility()
    // Interaction pauses rotation; the play button explicitly resumes it.
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  useEffect(() => {
    if (paused || !visible || reducedMotion || slides.length < 2) return
    const timer = window.setInterval(() => setIndex(current => (current + 1) % slides.length), 5000)
    return () => window.clearInterval(timer)
  }, [paused, visible, reducedMotion, slides.length])

  const current = slides.length ? index % slides.length : 0
  const slide = slides[current]
  const rotating = !paused && visible && !reducedMotion
  const controlClass = 'flex size-11 items-center justify-center rounded-full border border-white/30 bg-slate-950/70 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
  function select(next: number) { setIndex((next + slides.length) % slides.length); setPaused(true); setManualPlay(false) }

  if (!slide) return <section className="rounded-3xl bg-slate-900 px-6 py-14 text-white"><h1 className="text-3xl font-black">{SITE_TAGLINE}</h1></section>

  return <section aria-label="پیشنهادهای فروشگاه" aria-roledescription="اسلایدر" className="relative min-h-[440px] overflow-hidden rounded-3xl bg-slate-950 text-white sm:min-h-[500px] lg:min-h-[560px]"
    onMouseEnter={() => { if (!manualPlay) setPaused(true) }}
    onFocusCapture={() => { if (!manualPlay) setPaused(true) }}
    onKeyDown={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(current + 1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); select(current - 1) }
    }}>
    {!failedImages.has(slide.desktopImage.url) && <picture key={slide.id}>
      {slide.mobileImage && <source media="(max-width: 639px)" srcSet={slide.mobileImage.url} />}
      <img src={slide.desktopImage.url} alt={slide.imageAlt} width={slide.desktopImage.width} height={slide.desktopImage.height} fetchPriority={current === 0 ? 'high' : 'auto'} decoding="async"
        className="absolute inset-0 size-full object-cover motion-safe:animate-[hero-fade_420ms_ease-out]" onError={() => setFailedImages(value => new Set([...value, slide.desktopImage.url]))} />
    </picture>}
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-l from-slate-950/90 via-slate-950/75 to-slate-950/20" />
    <div aria-live={rotating ? 'off' : 'polite'} aria-atomic="true" className="relative px-6 pb-28 pt-12 sm:px-12 lg:px-16 lg:pt-20">
      <h1 className="max-w-2xl text-3xl font-black leading-snug sm:text-4xl lg:text-5xl">{slide.title}</h1>
      {slide.subtitle && <p className="mt-5 max-w-lg text-base leading-8 text-white">{slide.subtitle}</p>}
      {slide.href.startsWith('/') ? <Link to={slide.href} className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-xl bg-orange-700 px-6 py-3 font-bold text-white hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{slide.ctaLabel}<ArrowLeft size={18} aria-hidden="true" /></Link>
        : <a href={slide.href} rel="noopener noreferrer" className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-xl bg-orange-700 px-6 py-3 font-bold text-white hover:bg-orange-800">{slide.ctaLabel}<ArrowLeft size={18} aria-hidden="true" /></a>}
    </div>
    {slides.length > 1 && <div className="absolute inset-x-0 bottom-6 flex flex-wrap items-center justify-between gap-3 px-6 sm:px-12">
      <div className="flex items-center gap-2">
        <button type="button" className={controlClass} aria-label="اسلاید قبلی" onClick={() => select(current - 1)}><ChevronRight aria-hidden="true" size={20} /></button>
        <button type="button" className={controlClass} aria-label="اسلاید بعدی" onClick={() => select(current + 1)}><ChevronLeft aria-hidden="true" size={20} /></button>
        {!reducedMotion && <button type="button" className={controlClass} aria-label={paused ? 'شروع پخش خودکار' : 'توقف پخش خودکار'} onClick={() => { setPaused(value => !value); setManualPlay(paused) }}>{paused ? <Play aria-hidden="true" size={18} /> : <Pause aria-hidden="true" size={18} />}</button>}
      </div>
      <div className="flex items-center gap-1" aria-label="انتخاب اسلاید">
        {slides.map((item, position) => <button type="button" key={item.id} className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`نمایش اسلاید ${position + 1}`} aria-current={position === current ? 'true' : undefined} onClick={() => select(position)}>
          <span className={`h-2 rounded-full transition-all duration-300 motion-reduce:transition-none ${position === current ? 'w-7 bg-white' : 'w-2 bg-white/70'}`} />
        </button>)}
      </div>
    </div>}
  </section>
}
