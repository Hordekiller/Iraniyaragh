import { Link } from 'react-router-dom'
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '../state/cart-context'
import { formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { lineTotalRials } from '../services/cart/types'
import { useToast } from '../components/feedback/toast-context'
import { FREE_SHIPPING_THRESHOLD_RIALS, SHIPPING_COST_RIALS } from '../lib/site-config'

export function CartPage() {
  const { state, setQuantity, remove, clear } = useCart()
  const { show } = useToast()

  const subtotalR = state.lines.reduce((sum, line) => sum + lineTotalRials(line), 0)
  const shippingR = subtotalR >= FREE_SHIPPING_THRESHOLD_RIALS || state.lines.length === 0 ? 0 : SHIPPING_COST_RIALS
  const totalR = subtotalR + shippingR
  const itemCount = state.lines.reduce((sum, line) => sum + line.quantity, 0)

  if (state.lines.length === 0) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <ShoppingBag size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">سبد خرید شما خالی است</h1>
        <p className="mt-2 text-slate-500 text-sm">برای شروع خرید، از میان محصولات فروشگاه انتخاب کنید.</p>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">
          سبد خرید
          <span className="text-slate-400 text-sm font-bold mr-2">({toPersianDigits(itemCount)} کالا)</span>
        </h1>
        <button
          type="button"
          onClick={() => { clear(); show('سبد خرید خالی شد') }}
          className="text-xs font-bold text-red-600 hover:text-red-700"
        >
          حذف همه
        </button>
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {state.lines.map(line => (
            <div key={line.productId} className="flex items-center gap-4 rounded-[20px] border border-slate-100 bg-white p-4">
              <Link to={ROUTES.product(line.slug)} className="shrink-0 w-20 h-20 rounded-2xl bg-slate-50 overflow-hidden">
                <img src={line.image} alt={line.name} className="w-full h-full object-cover" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={ROUTES.product(line.slug)} className="text-sm font-bold text-slate-900 line-clamp-2 hover:text-[#FF4D00]">
                  {line.name}
                </Link>
                <div className="mt-1 text-xs text-slate-400">{line.brand}</div>
                <div className="mt-1 text-[13px] font-black text-slate-900">
                  {formatToman(lineTotalRials(line))}
                </div>
                <div className="text-[11px] text-slate-400">واحد: {formatToman(Number(line.unitPrice.amount))}</div>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 rounded-full border border-slate-200 p-0.5">
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity + 1)} aria-label={`افزایش تعداد ${line.name}`} className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-black">
                    <Plus size={14} aria-hidden="true" />
                  </button>
                  <span className="min-w-[20px] text-center text-sm font-black">{toPersianDigits(line.quantity)}</span>
                  <button type="button" onClick={() => setQuantity(line.productId, line.quantity - 1)} aria-label={`کاهش تعداد ${line.name}`} className="w-8 h-8 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center hover:bg-slate-200">
                    <Minus size={14} aria-hidden="true" />
                  </button>
                </div>
                <button type="button" onClick={() => remove(line.productId)} aria-label={`حذف ${line.name}`} className="text-xs font-bold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                  <Trash2 size={14} aria-hidden="true" /> حذف
                </button>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:col-span-1">
          <div className="rounded-[24px] border border-slate-100 bg-white p-5 lg:sticky lg:top-24">
            <h2 className="font-black text-slate-900">خلاصه سفارش</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <dt>جمع کل کالاها</dt>
                <dd className="font-bold">{formatToman(subtotalR)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>هزینه ارسال</dt>
                <dd className="font-bold">{shippingR === 0 ? 'رایگان' : formatToman(shippingR)}</dd>
              </div>
              <div className="h-px bg-slate-100 my-3" />
              <div className="flex justify-between items-center">
                <dt className="font-black text-slate-900">مبلغ قابل پرداخت</dt>
                <dd className="font-black text-[18px] text-[#FF4D00]">{formatToman(totalR)}</dd>
              </div>
            </dl>

            <Link
              to={ROUTES.checkout}
              className="mt-5 block w-full h-12 rounded-full bg-[#FF4D00] text-white font-black flex items-center justify-center hover:bg-[#E54400] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
            >
              ادامه فرایند خرید
            </Link>
            <Link to={ROUTES.home} className="mt-3 block w-full h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black flex items-center justify-center hover:bg-slate-900 hover:text-white transition">
              ادامه خرید
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
