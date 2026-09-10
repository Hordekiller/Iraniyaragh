import { useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Flame, Star, Zap } from 'lucide-react'
import { popularProducts } from '../../data/prototype'
import type { Product } from '../../types/content'
import { scrollCarousel, formatTomanDisplay } from '../../lib/carousel'
import { formatPersianNumber } from '../../lib/format'
import {
  DELIVERY_PROMO,
  FREE_SHIPPING_THRESHOLD_TOMAN,
  SHIPPING_COST_TOMAN,
  SUPPORT_HOURS,
  WORKING_HOURS,
  FILTER_PILLS,
  ALL_FILTER_PILL,
  SECTION_IDS,
} from '../../lib/site-config'

type PopularToolsProps = {
  onSelectProduct: (product: Product) => void
}

export function PopularTools({ onSelectProduct }: PopularToolsProps) {
  const [activeCategory, setActiveCategory] = useState<string>(ALL_FILTER_PILL)
  const [showDelivery, setShowDelivery] = useState(false)
  const popularRef = useRef<HTMLDivElement>(null)

  const filteredPopular = activeCategory === ALL_FILTER_PILL
    ? popularProducts
    : popularProducts.filter(p => p.cat === activeCategory)

  return (
    <section id={SECTION_IDS.popular} className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-10">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#FF4D00] text-white flex items-center justify-center"><Flame size={22} /></div>
            <div>
              <h2 className="font-black text-[18px] lg:text-[20px] leading-none text-slate-900">ابزار محبوب هفته</h2>
              <p className="text-slate-500 text-xs lg:text-[13px] mt-1">منتخب استادکاران بر اساس خرید واقعی</p>
            </div>
            <span className="hidden lg:inline-flex mr-4 px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 text-xs font-black border border-amber-200">🔥 داغ‌ترین‌ها</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-100 rounded-full">
              {FILTER_PILLS.map(c => (
                <button key={c} onClick={() => setActiveCategory(c)} className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeCategory === c ? 'bg-[#0F172A] text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => scrollCarousel(popularRef, 'right')} aria-label="پیمایش به راست" className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronRight size={18} /></button>
              <button onClick={() => scrollCarousel(popularRef, 'left')} aria-label="پیمایش به چپ" className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronLeft size={18} /></button>
            </div>
          </div>
        </div>

        {/* Mobile filter pills */}
        <div className="flex lg:hidden gap-2 mt-4 overflow-x-auto scrollbar-none pb-1">
          {FILTER_PILLS.map(c => (
            <button key={c} onClick={() => setActiveCategory(c)} className={`shrink-0 px-4 py-2 rounded-full text-xs font-bold border transition ${activeCategory === c ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-slate-700 border-slate-200'}`}>{c}</button>
          ))}
        </div>

        <div ref={popularRef} className="flex gap-3 lg:gap-4 overflow-x-auto scrollbar-none scroll-smooth snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
          {filteredPopular.map(p => (
            <button key={p.id} type="button" onClick={() => onSelectProduct(p)} className="snap-start shrink-0 w-[172px] lg:w-[210px] bg-slate-50 rounded-[20px] lg:rounded-[24px] p-3 lg:p-3.5 border border-slate-100 hover:border-[#FF4D00]/20 hover:shadow-lg hover:shadow-[#FF4D00]/5 transition cursor-pointer group text-right">
              <div className="relative rounded-2xl overflow-hidden bg-white h-[148px] lg:h-[168px] flex items-center justify-center">
                <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                {p.badge && <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#C2410C] text-white text-[10px] font-black">{p.badge}</span>}
                <span className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-600"><Zap size={14} aria-hidden="true" className="text-amber-500" /></span>
              </div>
              <div className="mt-3">
                <div className="text-[11px] font-bold text-slate-500 tracking-widest">{p.brand}</div>
                <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <div className="flex" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <Star key={i} size={12} className={i < Math.round(p.rating) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200'} />)}</div>
                  <span className="text-xs font-bold">{p.rating}</span><span className="text-xs text-slate-500">({p.reviews})</span>
                </div>
                <div className="mt-2.5 flex items-end justify-between">
                  <div>
                    <div className="text-[#0F172A] font-black text-[15px] leading-none">{formatTomanDisplay(p.price)} <span className="text-[10px] font-bold">تومان</span></div>
                    {p.oldPrice && <div className="text-xs text-slate-500 line-through">{formatTomanDisplay(p.oldPrice)}</div>}
                  </div>
                  <span className="w-9 h-9 rounded-full bg-[#0F172A] text-white flex items-center justify-center group-hover:bg-[#FF4D00] transition"><ArrowLeft size={16} /></span>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between bg-[#0F172A] rounded-2xl px-4 lg:px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#FF4D00] flex items-center justify-center"><Clock3 size={16} /></span>
            <div>
              <div className="font-black text-sm">{DELIVERY_PROMO.title}</div>
              <div className="text-white/60 text-xs">{DELIVERY_PROMO.subtitle}</div>
            </div>
          </div>
          <button
            onClick={() => setShowDelivery(v => !v)}
            aria-expanded={showDelivery}
            aria-controls="delivery-details"
            className="hidden lg:flex h-9 px-5 rounded-full bg-white text-slate-900 font-bold text-sm"
          >
            {showDelivery ? 'بستن' : 'جزئیات'}
          </button>
        </div>
        {showDelivery && (
          <div id="delivery-details" className="mt-3 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-700">
            <ul className="space-y-2">
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />ارسال رایگان برای سفارش‌های بالای {formatPersianNumber(FREE_SHIPPING_THRESHOLD_TOMAN)} تومان</li>
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />هزینه ارسال عادی {formatPersianNumber(SHIPPING_COST_TOMAN)} تومان</li>
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />ساعات کاری: {WORKING_HOURS}</li>
              <li className="flex items-start gap-2"><span className="mt-2 w-1.5 h-1.5 rounded-full bg-[#FF4D00] shrink-0" />پشتیبانی: {SUPPORT_HOURS}</li>
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}