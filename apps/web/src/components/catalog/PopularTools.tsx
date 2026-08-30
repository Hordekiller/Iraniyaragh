import { useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Flame, Star, Zap } from 'lucide-react'
import { popularProducts } from '../../data/prototype'
import type { Product } from '../../types/content'
import { formatToman, scrollCarousel } from '../../lib/carousel'
import { useToast } from '../feedback/toast-context'

const FILTER_PILLS = ['همه', 'ابزار برقی', 'ابزار دستی', 'باغبانی']

type PopularToolsProps = {
  onSelectProduct: (product: Product) => void
}

export function PopularTools({ onSelectProduct }: PopularToolsProps) {
  const [activeCategory, setActiveCategory] = useState('همه')
  const popularRef = useRef<HTMLDivElement>(null)
  const { show } = useToast()

  const filteredPopular = activeCategory === 'همه'
    ? popularProducts
    : popularProducts.filter(p => p.cat === activeCategory)

  return (
    <section id="popular" className="max-w-[1280px] mx-auto px-4 lg:px-6 mt-10">
      <div className="bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-[#FF4D00] text-white flex items-center justify-center"><Flame size={22} /></div>
            <div>
              <h3 className="font-black text-[18px] lg:text-[20px] leading-none text-slate-900">ابزار محبوب هفته</h3>
              <p className="text-slate-500 text-xs lg:text-[13px] mt-1">منتخب استادکاران بر اساس خرید واقعی</p>
            </div>
            <span className="hidden lg:inline-flex mr-4 px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 text-xs font-black border border-amber-200">🔥 داغ‌ترین‌ها</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 p-1 bg-slate-100 rounded-full">
              {FILTER_PILLS.map(c => (
                <button key={c} onClick={() => setActiveCategory(c)} className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeCategory === c ? 'bg-[#0F172A] text-white shadow' : 'text-slate-600 hover:text-slate-900'}`}>{c}</button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => scrollCarousel(popularRef, 'right')} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronRight size={18} /></button>
              <button onClick={() => scrollCarousel(popularRef, 'left')} className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white hover:border-slate-900 transition"><ChevronLeft size={18} /></button>
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
            <div key={p.id} onClick={() => onSelectProduct(p)} className="snap-start shrink-0 w-[172px] lg:w-[210px] bg-slate-50 rounded-[20px] lg:rounded-[24px] p-3 lg:p-3.5 border border-slate-100 hover:border-[#FF4D00]/20 hover:shadow-lg hover:shadow-[#FF4D00]/5 transition cursor-pointer group">
              <div className="relative rounded-2xl overflow-hidden bg-white h-[148px] lg:h-[168px] flex items-center justify-center">
                <img src={p.image} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                {p.badge && <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#FF4D00] text-white text-[10px] font-black">{p.badge}</span>}
                <span className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center text-slate-600"><Zap size={14} className="text-amber-500" /></span>
              </div>
              <div className="mt-3">
                <div className="text-[11px] font-bold text-slate-400 tracking-widest">{p.brand}</div>
                <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <div className="flex"><Star size={12} className="fill-amber-400 text-amber-400" /><Star size={12} className="fill-amber-400 text-amber-400" /><Star size={12} className="fill-amber-400 text-amber-400" /><Star size={12} className="fill-amber-400 text-amber-400" /><Star size={12} className="fill-slate-200 text-slate-200" /></div>
                  <span className="text-xs font-bold">{p.rating}</span><span className="text-xs text-slate-400">({p.reviews})</span>
                </div>
                <div className="mt-2.5 flex items-end justify-between">
                  <div>
                    <div className="text-[#0F172A] font-black text-[15px] leading-none">{formatToman(p.price)} <span className="text-[10px] font-bold">تومان</span></div>
                    {p.oldPrice && <div className="text-xs text-slate-400 line-through">{formatToman(p.oldPrice)}</div>}
                  </div>
                  <button className="w-9 h-9 rounded-full bg-[#0F172A] text-white flex items-center justify-center group-hover:bg-[#FF4D00] transition"><ArrowLeft size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between bg-[#0F172A] rounded-2xl px-4 lg:px-5 py-3.5 text-white">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-[#FF4D00] flex items-center justify-center"><Clock3 size={16} /></span>
            <div>
              <div className="font-black text-sm">ارسال امروز اگر تا ۲ ساعت دیگر سفارش دهید</div>
              <div className="text-white/60 text-xs">تهران و کرج • تحویل درب منزل</div>
            </div>
          </div>
          <button onClick={() => show('جزئیات ارسال')} className="hidden lg:flex h-9 px-5 rounded-full bg-white text-slate-900 font-bold text-sm">جزئیات</button>
        </div>
      </div>
    </section>
  )
}