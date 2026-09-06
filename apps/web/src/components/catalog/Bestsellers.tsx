import { useRef } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { bestSellers } from '../../data/prototype'
import type { Product } from '../../types/content'
import { scrollCarousel } from '../../lib/carousel'
import { useToast } from '../feedback/toast-context'

type BestsellersProps = {
  onSelectProduct: (product: Product) => void
}

export function Bestsellers({ onSelectProduct }: BestsellersProps) {
  const bestRef = useRef<HTMLDivElement>(null)
  const { show } = useToast()

  return (
    <div id="bestseller" className="lg:col-span-8 bg-white rounded-[24px] lg:rounded-[28px] p-4 lg:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-black text-[18px] lg:text-[20px] text-slate-900 flex items-center gap-3">
          <span className="w-1.5 h-7 rounded-full bg-[#0F172A]" /> پرفروش‌ترین‌ها
          <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">این ماه <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /></span>
        </h2>
        <div className="flex gap-1.5">
          <button onClick={() => scrollCarousel(bestRef, 'right')} aria-label="پیمایش به راست" className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><ChevronRight size={16} /></button>
          <button onClick={() => scrollCarousel(bestRef, 'left')} aria-label="پیمایش به چپ" className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"><ChevronLeft size={16} /></button>
        </div>
      </div>

      <div ref={bestRef} className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
        {bestSellers.map(p => (
          <button key={p.id} type="button" onClick={() => onSelectProduct(p)} className="snap-start shrink-0 w-[160px] lg:w-[186px] rounded-[20px] border border-slate-100 overflow-hidden hover:shadow-lg hover:border-slate-200 transition cursor-pointer bg-slate-50 text-right">
            <div className="relative h-[136px] bg-white overflow-hidden">
              <img src={p.image} alt="" className="w-full h-full object-cover hover:scale-105 transition duration-500" />
              <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black">{p.badge || 'پرفروش'}</span>
            </div>
            <div className="p-3">
              <div className="text-xs font-bold text-slate-500">{p.brand}</div>
              <div className="text-[13px] font-bold leading-5 text-slate-900 line-clamp-2 min-h-[40px]">{p.title}</div>
              <div className="flex items-center gap-1 mt-1.5 text-xs"><Star size={12} className="fill-amber-400 text-amber-400" aria-hidden="true" /> <span className="font-bold">{p.rating}</span> <span className="text-slate-500">({p.reviews})</span></div>
              <div className="mt-2 flex items-baseline gap-1.5"><span className="font-black text-[14px] text-slate-900">{p.price.toLocaleString('fa-IR')}</span><span className="text-[10px]">تومان</span></div>
              {p.oldPrice && <div className="text-xs text-slate-500 line-through">{p.oldPrice.toLocaleString('fa-IR')}</div>}
            </div>
          </button>
        ))}
      </div>

      <button onClick={() => show('همه پرفروش‌ها')} className="w-full mt-4 h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black text-sm hover:bg-slate-900 hover:text-white transition flex items-center justify-center gap-2">
        مشاهده همه پرفروش‌ها <ArrowLeft size={16} />
      </button>
    </div>
  )
}