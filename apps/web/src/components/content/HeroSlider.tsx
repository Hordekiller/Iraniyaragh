import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { SITE_NAME, SITE_TAGLINE } from '../../lib/site-config'

// Reuse the archived storefront artwork with truthful discovery copy.
const slides = [
  { image: '/images/hero1.jpg', title: SITE_TAGLINE, description: 'ابزار و یراق مورد نیاز خود را در کاتالوگ فروشگاه پیدا کنید.', cta: 'مشاهده کالاها', to: ROUTES.search },
  { image: '/images/hero2.jpg', title: 'انتخاب ابزار برای پروژهٔ شما', description: 'مشخصات، تصاویر و قیمت ثبت‌شدهٔ کالاها را پیش از انتخاب بررسی کنید.', cta: 'جستجوی ابزار', to: ROUTES.search },
  { image: '/images/hero3.jpg', title: 'از انتخاب تا پیگیری سفارش', description: 'سفارش‌های خود و وضعیت ثبت‌شدهٔ پرداخت و ارسال را در حساب کاربری ببینید.', cta: 'پیگیری سفارش‌ها', to: ROUTES.orders },
] as const

export function HeroSlider() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
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
    // Rotation is opt-in; focus, hover, hidden tab and reduced motion pause it.
    preference.addEventListener('change', update)
    document.addEventListener('visibilitychange', visibility)
    return () => { preference.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility) }
  }, [])

  useEffect(() => {
    if (paused || hovered || focused || !visible || reducedMotion) return
    const timer = window.setInterval(() => setIndex(current => (current + 1) % slides.length), 5500)
    return () => window.clearInterval(timer)
  }, [paused, hovered, focused, visible, reducedMotion])

  const slide = slides[index]
  const rotating = !paused && !hovered && !focused && visible && !reducedMotion
  const controlClass = 'flex size-11 items-center justify-center rounded-full border border-white/30 bg-slate-950/70 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
  function select(next: number) { setIndex((next + slides.length) % slides.length); setPaused(true) }

  return <section aria-label="پیشنهادهای فروشگاه" aria-roledescription="اسلایدر" className="relative min-h-[440px] overflow-hidden rounded-3xl bg-slate-950 text-white sm:min-h-[500px] lg:min-h-[560px]"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
    onKeyDown={event => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); select(index + 1) }
      if (event.key === 'ArrowRight') { event.preventDefault(); select(index - 1) }
    }}>
    {!failedImages.has(slide.image) && <img key={slide.image} src={slide.image} alt="" width={1600} height={900} fetchPriority={index === 0 ? 'high' : 'auto'} decoding="async"
      className="absolute inset-0 size-full object-cover" onError={() => setFailedImages(current => new Set([...current, slide.image]))} />}
    <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-l from-slate-950/95 via-slate-950/85 to-slate-950/50" />
    <div aria-live={rotating ? 'off' : 'polite'} aria-atomic="true" className="relative px-6 pb-28 pt-12 sm:px-12 lg:px-16 lg:pt-20">
      <p className="inline-flex rounded-full border border-white/30 bg-slate-950/60 px-4 py-2 text-sm font-bold">{SITE_NAME}</p>
      <h1 className="mt-6 max-w-2xl text-3xl font-black leading-snug sm:text-4xl lg:text-5xl">{slide.title}</h1>
      <p className="mt-5 max-w-lg text-base leading-8 text-white">{slide.description}</p>
      <Link to={slide.to} className="mt-7 inline-flex min-h-12 items-center gap-3 rounded-xl bg-orange-700 px-6 py-3 font-bold text-white hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{slide.cta}<ArrowLeft size={18} aria-hidden="true" /></Link>
    </div>
    <div className="absolute inset-x-0 bottom-6 flex flex-wrap items-center justify-between gap-3 px-6 sm:px-12">
      <div className="flex items-center gap-2">
        <button type="button" className={controlClass} aria-label="اسلاید قبلی" onClick={() => select(index - 1)}><ChevronRight aria-hidden="true" size={20} /></button>
        <button type="button" className={controlClass} aria-label="اسلاید بعدی" onClick={() => select(index + 1)}><ChevronLeft aria-hidden="true" size={20} /></button>
        {!reducedMotion && <button type="button" className={controlClass} aria-label={paused ? 'شروع پخش خودکار' : 'توقف پخش خودکار'} onClick={() => setPaused(current => !current)}>{paused ? <Play aria-hidden="true" size={18} /> : <Pause aria-hidden="true" size={18} />}</button>}
      </div>
      <div className="flex items-center gap-1" aria-label="انتخاب اسلاید">
        {slides.map((item, position) => <button type="button" key={item.image} className="flex size-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          aria-label={`نمایش اسلاید ${position + 1}`} aria-current={position === index ? 'true' : undefined} onClick={() => select(position)}>
          <span className={`h-2 rounded-full ${position === index ? 'w-7 bg-white' : 'w-2 bg-white/70'}`} />
        </button>)}
      </div>
    </div>
  </section>
}
