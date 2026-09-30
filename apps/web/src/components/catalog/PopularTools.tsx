import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, RotateCcw, Sparkles } from 'lucide-react'
import { scrollCarousel } from '../../lib/carousel'
import { formatToman } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { SECTION_IDS } from '../../lib/site-config'
import { useCatalogApi } from '../../state/catalog-context'
import type { CatalogProduct } from '../../services/catalog/types'

const SNIPPET_LIMIT = 8

type PopularToolsProps = {
  onSelectProduct: (product: CatalogProduct) => void
}

export function PopularTools({ onSelectProduct }: PopularToolsProps) {
  const api = useCatalogApi()
  const [items, setItems] = useState<CatalogProduct[] | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const retry = () => {
    setItems(null)
    setError(false)
    setAttempt(n => n + 1)
  }
  const [showDetails, setShowDetails] = useState(false)
  const popularRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api
      .listProducts({ sortBy: 'newest' })
      .then(result => {
        if (cancelled) return
        setItems(result.items.slice(0, SNIPPET_LIMIT))
      })
      .catch(() => {
        if (cancelled) return
        setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [api, attempt])

  return (
    <section id={SECTION_IDS.newest} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-10">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#FF4D00] text-white flex items-center justify-center"><Sparkles size={22} /></div>
            <div>
              <h2 className="font-black text-[18px] lg:text-[20px] leading-none text-slate-900">تازه‌های فروشگاه</h2>
              <p className="text-slate-500 text-xs lg:text-[13px] mt-1">جدیدترین محصولات کاتالوگ</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={ROUTES.newest}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:border-slate-900 hover:text-slate-900 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
            >
              مشاهده همه
              <ChevronLeft size={15} aria-hidden="true" />
            </Link>
            <button onClick={() => scrollCarousel(popularRef, 'right')} aria-label="پیمایش به راست" className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronRight size={18} /></button>
            <button onClick={() => scrollCarousel(popularRef, 'left')} aria-label="پیمایش به چپ" className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronLeft size={18} /></button>
          </div>
        </div>

        {items === null && !error && (
          <div className="mt-5 text-slate-500 text-sm" aria-live="polite">در حال بارگذاری محصولات...</div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl bg-red-50 border border-red-200 p-4">
            <p role="alert" className="text-sm font-bold text-red-700">
              بارگذاری محصولات با خطا مواجه شد.
            </p>
            <button
              type="button"
              onClick={retry}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-800 transition hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
            >
              <RotateCcw size={14} aria-hidden="true" />
              تلاش دوباره
            </button>
          </div>
        )}

        {items && items.length > 0 && (
          // 2.1.1 Keyboard: a hidden scrollbar plus a sideways scroller is a
          // dead end for a keyboard user, so the strip is focusable, named, and
          // shows a ring when it is.
          <div
            ref={popularRef}
            role="group"
            aria-label="محصولات تازه"
            tabIndex={0}
            className="flex gap-3 lg:gap-4 overflow-x-auto scrollbar-none scroll-smooth motion-reduce:scroll-auto snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 rounded-2xl"
          >
            {items.map(product => (
              <button key={product.id} type="button" onClick={() => onSelectProduct(product)} className="snap-start shrink-0 w-[172px] lg:w-[210px] bg-slate-50 rounded-[20px] lg:rounded-[24px] p-3 lg:p-3.5 border border-slate-100 hover:border-[#FF4D00]/20 hover:shadow-lg hover:shadow-[#FF4D00]/5 transition cursor-pointer group text-right">
                <div className="relative rounded-2xl overflow-hidden bg-white h-[148px] lg:h-[168px] flex items-center justify-center">
                  <img src={product.image} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition duration-500 motion-reduce:transition-none" />
                </div>
                <div className="mt-3">
                  <div className="text-[11px] font-bold text-slate-500 tracking-widest">{product.brand ?? product.category?.name ?? ''}</div>
                  <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{product.name}</div>
                  <div className="mt-2.5 flex items-end justify-between">
                    <div className="text-[#0F172A] font-black text-[14px] leading-none">{formatToman(product.price.amount)}</div>
                    <span className="w-9 h-9 rounded-full bg-[#0F172A] text-white flex items-center justify-center group-hover:bg-[#FF4D00] transition"><ArrowLeft size={16} /></span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between bg-[#0F172A] rounded-2xl px-4 lg:px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#FF4D00] flex items-center justify-center"><Clock3 size={16} /></span>
            <div>
              <div className="font-black text-sm">هزینهٔ ارسال هنگام پرداخت محاسبه می‌شود</div>
              <div className="text-white/60 text-xs">جمع نهایی سفارش در مرحلهٔ پرداخت از سمت فروشگاه تایید می‌شود</div>
            </div>
          </div>
          <button
            onClick={() => setShowDetails(v => !v)}
            aria-expanded={showDetails}
            aria-controls="delivery-details"
            // Was `hidden lg:flex`, which left the delivery details unreachable
            // on every phone: the panel could only be opened on a desktop.
            className="flex h-9 shrink-0 px-5 rounded-full bg-white text-slate-900 font-bold text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            {showDetails ? 'بستن' : 'جزئیات'}
          </button>
        </div>
        {showDetails && (
          <div id="delivery-details" className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700">
            <ul className="space-y-2">
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />قیمت کالاها هنگام پرداخت از سمت سرور تایید می‌شود</li>
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />هزینهٔ ارسال پس از واردکردن اطلاعات دریافت‌کننده اعلام می‌شود</li>
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />وضعیت هر سفارش را می‌توانید از «پیگیری سفارش» دنبال کنید</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}