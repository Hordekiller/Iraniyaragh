import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, CreditCard, ShieldCheck } from 'lucide-react'
import { useOrderApi } from '../state/order-context'
import { useCart } from '../state/cart-context'
import { formatToman, toPersianDigits, formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { StoreOrder } from '../services/cart/types'

export function PaymentPage() {
  const orders = useOrderApi()
  const { remove } = useCart()
  const { id = '' } = useParams<{ id: string }>()

  const [order, setOrder] = useState<StoreOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [paid, setPaid] = useState(false)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [resolvedId, setResolvedId] = useState(id)
  if (resolvedId !== id) {
    setResolvedId(id)
    setOrder(null)
    setLoading(true)
    setNotFound(false)
    setPaid(false)
  }

  useEffect(() => {
    let cancelled = false
    orders
      .getOrder(id)
      .then(o => {
        if (cancelled) return
        setOrder(o)
        setPaid(o.status === 'PAID')
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setNotFound(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orders, id])

  async function handlePay() {
    setPaymentError(null)
    setProcessing(true)
    try {
      const updated = await orders.markPaid(id)
      setOrder(updated)
      setPaid(true)
      for (const item of updated.items) remove(item.productId)
    } catch {
      setPaymentError('پرداخت انجام نشد. وضعیت سفارش تغییر نکرد؛ دوباره تلاش کنید.')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">در حال بارگذاری درگاه پرداخت...</div>

  if (notFound || !order) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">سفارش یافت نشد</h1>
        <Link to={ROUTES.home} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به فروشگاه
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[560px] mx-auto px-4 py-10">
      <div className="rounded-[28px] border border-slate-100 bg-white p-6 text-center">
        {paid ? (
          <div>
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={32} aria-hidden="true" />
            </div>
            <h1 className="mt-4 font-black text-slate-900 text-xl">پرداخت با موفقیت انجام شد</h1>
            <p className="mt-2 text-sm text-slate-500">
              سفارش <span dir="ltr" className="font-bold text-slate-900">{order.id}</span> شما ثبت و پرداخت شد. جزئیات از طریق پیامک ارسال خواهد شد.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              مبلغ پرداخت‌شده: <span className="font-black text-[#FF4D00]">{formatToman(order.totalRials)}</span>
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link to={ROUTES.order(order.id)} className="w-full h-12 rounded-full bg-[#FF4D00] text-white font-black flex items-center justify-center hover:bg-[#E54400] transition">
                مشاهده جزئیات سفارش
              </Link>
              <Link to={ROUTES.home} className="w-full h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black flex items-center justify-center hover:bg-slate-900 hover:text-white transition">
                بازگشت به فروشگاه
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center">
              <CreditCard size={30} aria-hidden="true" />
            </div>
            <h1 className="mt-4 font-black text-slate-900 text-xl">درگاه پرداخت</h1>
            <p className="mt-1 text-xs text-slate-400">سفارش {order.id} • {formatTimestamp(order.createdAt)}</p>

            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-right">
              <div className="flex justify-between text-sm text-slate-600">
                <span>مبلغ قابل پرداخت</span>
                <span className="font-black text-[#FF4D00]">{formatToman(order.totalRials)}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm text-slate-600">
                <span>رسید شماره</span>
                <span dir="ltr" className="font-bold">{toPersianDigits(100000 + (order.totalRials % 100000))}</span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck size={15} /> درگاه پرداخت امن (نمونه آزمایشی)
            </div>

            {paymentError && <p role="alert" className="mt-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-3 text-sm font-bold">{paymentError}</p>}

            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={processing}
              className="mt-5 w-full h-12 rounded-full bg-[#0F172A] text-white font-black hover:bg-black disabled:opacity-60 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              {processing ? 'در حال پردازش...' : 'پرداخت موفق (تست)'}
            </button>

            <Link to={ROUTES.cart} className="mt-3 inline-block text-xs font-bold text-slate-500 hover:text-slate-900">
              بازگشت به سبد خرید
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
