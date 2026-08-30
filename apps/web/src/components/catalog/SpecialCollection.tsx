import { useRef } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { specialProducts } from '../../data/prototype'
import type { Product } from '../../types/content'
import { scrollCarousel } from '../../lib/carousel'
import { useToast } from '../feedback/toast-context'

type SpecialCollectionProps = {
  onSelectProduct: (product: Product) => void
}

export function SpecialCollection({ onSelectProduct }: SpecialCollectionProps) {
  const specialRef = useRef<HTMLDivElement>(null)
  const { show } = useToast()

  return (
    <div className="lg:col-span-4 bg-[#0F172A] rounded-[24px] lg:rounded-[28px] p-4 lg:p-6 text-white relative overflow-hidden">
      <div className="absolute -left-10 -top-10 w-40 h-40 rounded-full bg-[#FF4D00] blur-[60px] opacity-30" />
      <div className="absolute -right-10 bottom-10 w-40 h-40 rounded-full bg-[#F59E0B] blur-[50px] opacity-20" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF4D00] flex items-center justify-center font-black">R</div>
            <div>
              <div className="font-black text-[15px] leading-none">سری مشکی رونیکس</div>
              <div className="text-white/60 text-xs font-medium">RONIX PRO • ابزار دسته‌بندی خاص</div>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white text-slate-900 text-[11px] font-black">۴ کالا</span>
        </div>
        <p className="text-white/70 text-xs leading-6 mt-3">کلکسیون ابزار صنعتی مشکی مات با موتور براشلس و گارانتی ۲۴ ماهه — انتخاب حرفه‌ای‌ها</p>

        <div ref={specialRef} className="flex gap-3 overflow-x-auto scrollbar-none snap-x snap-mandatory mt-5 pb-2 -mx-1 px-1">
          {specialProducts.map(p => (
            <div key={p.id} onClick={() => onSelectProduct(p)} className="snap-start shrink-0 w-[170px] bg-white rounded-[20px] p-2.5 text-slate-900 cursor-pointer hover:shadow-xl transition">
              <div className="relative rounded-2xl overflow-hidden bg-slate-50 h-[120px]">
                <img src={p.image} className="w-full h-full object-cover" />
                <span className="absolute top-2 right-2 px-2 py-1 rounded-full bg-[#0F172A] text-white text-[10px] font-bold">{p.badge || 'PRO'}</span>
              </div>
              <div className="mt-2.5 px-1">
                <div className="text-[12.5px] font-bold leading-5 line-clamp-2 min-h-[40px]">{p.title}</div>
                <div className="flex items-center gap-1 mt-1"><Star size={11} className="fill-amber-400 text-amber-400" /><span className="text-xs font-bold">{p.rating}</span></div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-black text-sm">{(p.price / 1000000).toFixed(1)}<span className="text-[10px] mr-1">م تومن</span></span>
                  <span className="w-7 h-7 rounded-full bg-[#FF4D00] text-white flex items-center justify-center"><ArrowLeft size={14} /></span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => scrollCarousel(specialRef, 'right')} className="flex-1 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white hover:text-slate-900 transition"><ChevronRight size={18} /></button>
          <button onClick={() => scrollCarousel(specialRef, 'left')} className="flex-1 h-10 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white hover:text-slate-900 transition"><ChevronLeft size={18} /></button>
          <button onClick={() => show('کلکسیون رونیکس')} className="flex-[2] h-10 rounded-full bg-[#FF4D00] font-black text-sm hover:bg-[#e64500] transition">نمایش کلکسیون</button>
        </div>
      </div>
    </div>
  )
}