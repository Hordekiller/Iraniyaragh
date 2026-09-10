import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useOrderApi } from '../state/order-context'
import { formatToman, toPersianDigits, formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { StoreOrder } from '../services/cart/types'
import { useAuth } from '../state/auth-context'

const STATUS_LABEL: Record<StoreOrder['status'], string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  SHIPPED: 'در حال ارسال',
  DELIVERED: 'تحویل‌شده',
  CANCELLED: 'لغو شده',
}

const STATUS_CLASS: Record<StoreOrder['status'], string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  SHIPPED: 'bg-sky-50 text-sky-700 border-sky-200',
  DELIVERED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
}

export function OrdersPage() {
  const orders = useOrderApi()
  const { state: authState, controller: authController } = useAuth()
  const [items, setItems] = useState<StoreOrder[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authState.phase !== 'authenticated') return undefined
    let cancelled = false
    orders
      .listOrders()
      .then(list => {
        if (cancelled) return
        setItems(list)
      })
      .catch(() => {
        if (cancelled) return
        setError('دریافت سفارش‌ها با خطا مواجه شد.')
      })
    return () => {
      cancelled = true
    }
  }, [authState.phase, orders])

  if (authState.phase !== 'authenticated') {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">برای مشاهده سفارش‌ها وارد شوید</h1>
        <p className="mt-2 text-slate-500 text-sm">سابقهٔ سفارش‌ها فقط برای حساب صاحب سفارش نمایش داده می‌شود.</p>
        <button type="button" onClick={() => { void authController.open() }} className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold">
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">سفارش‌های من</h1>
        <Link to={ROUTES.home} className="text-xs font-bold text-slate-500 hover:text-slate-900">
          بازگشت به فروشگاه
        </Link>
      </div>

      {items === null && !error && <div className="mt-8 text-slate-500" aria-live="polite">در حال بارگذاری...</div>}

      {error && (
        <div className="mt-8 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold" role="alert">
          {error}
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <p className="mt-8 text-slate-500 text-sm">هنوز سفارشی ثبت نکرده‌اید.</p>
      )}

      {items !== null && items.length > 0 && (
        <div className="mt-6 space-y-4">
          {items.map(order => (
            <div key={order.id} className="rounded-[20px] border border-slate-100 bg-white p-4 lg:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link to={ROUTES.order(order.id)} className="font-black text-slate-900 hover:text-[#FF4D00]">
                    سفارش <span dir="ltr">{order.id}</span>
                  </Link>
                  <div className="text-xs text-slate-400 mt-0.5">{formatTimestamp(order.createdAt)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_CLASS[order.status]}`}>
                    {STATUS_LABEL[order.status]}
                  </span>
                  <span className="font-black text-[#FF4D00]">{formatToman(order.totalRials)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {order.items.slice(0, 4).map(item => (
                  <div key={item.productId} className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    <img src={item.image} alt="" className="w-6 h-6 rounded object-cover" />
                    <span className="line-clamp-1 max-w-[160px]">{item.name}</span>
                    <span className="text-slate-400">×{toPersianDigits(item.quantity)}</span>
                  </div>
                ))}
                {order.items.length > 4 && (
                  <span className="text-xs text-slate-400 self-center">+{toPersianDigits(order.items.length - 4)} دیگر</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
