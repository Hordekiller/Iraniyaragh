import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, Star, Truck, X } from 'lucide-react'
import type { Product } from '../../types/content'
import { useToast } from './toast-context'

type ProductModalProps = {
  product: Product | null
  onClose: () => void
}

const MODAL_FEATURES = [
  { k: 'قدرت', v: '750 وات' },
  { k: 'وزن', v: '1.8 کیلوگرم' },
  { k: 'گارانتی', v: '18 ماه' },
]

export function ProductModal({ product, onClose }: ProductModalProps) {
  const { show } = useToast()

  return (
    <AnimatePresence>
      {product && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end lg:items-center justify-center p-0 lg:p-4" onClick={onClose}>
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} onClick={e => e.stopPropagation()} className="w-full max-w-[720px] bg-white rounded-t-[28px] lg:rounded-[28px] overflow-hidden max-h-[92vh] overflow-y-auto">
            <div className="relative h-[280px] lg:h-[360px] bg-slate-50">
              <img src={product.image} className="w-full h-full object-cover" />
              <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white shadow flex items-center justify-center"><X size={18} /></button>
              {product.badge && <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-[#FF4D00] text-white text-xs font-black">{product.badge}</span>}
            </div>
            <div className="p-6">
              <div className="text-xs font-black tracking-widest text-slate-400">{product.brand} • {product.cat}</div>
              <h3 className="font-black text-[18px] leading-7 text-slate-900 mt-1">{product.title}</h3>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex"><Star size={14} className="fill-amber-400 text-amber-400" /><Star size={14} className="fill-amber-400 text-amber-400" /><Star size={14} className="fill-amber-400 text-amber-400" /><Star size={14} className="fill-amber-400 text-amber-400" /><Star size={14} className="fill-slate-200 text-slate-200" /></div>
                <span className="text-sm font-bold">{product.rating}</span><span className="text-sm text-slate-400">({product.reviews} نظر)</span><span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">موجود در انبار</span>
              </div>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="font-black text-[22px] text-slate-900">{product.price.toLocaleString('fa-IR')} تومان</span>
                {product.oldPrice && <span className="text-sm text-slate-400 line-through">{product.oldPrice.toLocaleString('fa-IR')}</span>}
                {product.oldPrice && <span className="px-2 py-1 rounded-full bg-red-500 text-white text-xs font-black">٪{Math.round((1 - product.price / product.oldPrice) * 100)} تخفیف</span>}
              </div>
              <p className="text-[13px] leading-7 text-slate-500 mt-4">این ابزار با موتور قدرتمند، بدنه ارگونومیک ضد لرزش و گیربکس صنعتی برای استفاده طولانی‌مدت در کارگاه و پروژه‌های ساختمانی طراحی شده است. همراه با کیف BMC، دفترچه و کارت گارانتی.</p>
              <div className="grid grid-cols-3 gap-2 mt-5">
                {MODAL_FEATURES.map(f => (
                  <div key={f.k} className="rounded-2xl bg-slate-50 border border-slate-100 p-3 text-center">
                    <div className="text-xs text-slate-400 font-bold">{f.k}</div><div className="font-black text-slate-900 text-sm mt-1">{f.v}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => { show('به سبد افزوده شد'); onClose() }} className="flex-1 h-12 rounded-full bg-[#FF4D00] text-white font-black hover:bg-[#e64500] transition">افزودن به سبد خرید</button>
                <button onClick={() => show('مشاوره: ۰۲۱-۸۸۸۸۸۸۸۸')} className="h-12 px-6 rounded-full border-2 border-slate-900 font-black">مشاوره</button>
              </div>
              <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-400">
                <span className="flex items-center gap-1"><Truck size={14} /> ارسال رایگان</span>
                <span className="flex items-center gap-1"><ShieldCheck size={14} /> ضمانت بازگشت ۷ روزه</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}