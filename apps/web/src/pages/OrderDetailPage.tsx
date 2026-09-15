import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MapPin, Package } from 'lucide-react'
import { useOrderApi } from '../state/order-context'
import { formatToman, toPersianDigits, formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { StoreOrder } from '../services/cart/types'

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

export function OrderDetailPage() {
  const orders = useOrderApi()
  const { id = '' } = useParams<{ id: string }>()

  const [order, setOrder] = useState<StoreOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [resolvedId, setResolvedId] = useState(id)
  if (resolvedId !== id) {
    setResolvedId(id)
    setOrder(null)
    setLoading(true)
    setNotFound(false)
  }

  useEffect(() => {
    let cancelled = false
    orders
      .getOrder(id)
      .then(o => {
        if (cancelled) return
        setOrder(o)
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

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">در حال بارگذاری سفارش...</div>

  if (notFound || !order) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">سفارش یافت نشد</h1>
        <Link to={ROUTES.orders} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به سفارش‌ها
        </Link>
      </div>
    )
  }

  const unpaid = order.status === 'PENDING_PAYMENT'

  return (
    <div className="max-w-[960px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-black text-slate-900 text-lg lg:text-xl">
            سفارش <span dir="ltr">{order.id}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{formatTimestamp(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_CLASS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          {unpaid && (
            <Link
              to={ROUTES.payment(order.id)}
              className="h-10 px-5 rounded-full bg-[#FF4D00] text-white font-black inline-flex items-center hover:bg-[#E54400] transition"
            >
              پرداخت
            </Link>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-100 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
          <Package size={18} aria-hidden="true" />
          اقلام سفارش
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {order.items.map(item => (
            <li key={item.productId} className="flex items-center gap-4 py-3">
              <img src={item.image} alt="" className="w-14 h-14 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <Link to={ROUTES.product(item.slug)} className="block font-bold text-slate-900 text-sm truncate hover:text-[#FF4D00]">
                  {item.name}
                </Link>
                <div className="text-xs text-slate-400 mt-0.5">تعداد {toPersianDigits(item.quantity)}</div>
              </div>
              <span className="font-black text-slate-900 text-sm whitespace-nowrap">{formatToman(Number(item.unitPrice.amount) * item.quantity)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>جمع سفارش</span>
            <span>{formatToman(order.subtotalRials)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>هزینه ارسال</span>
            <span>{order.shippingRials > 0 ? formatToman(order.shippingRials) : 'رایگان'}</span>
          </div>
          <div className="flex justify-between font-black text-slate-900 text-base pt-1 border-t border-slate-100">
            <span>مبلغ نهایی</span>
            <span className="text-[#FF4D00]">{formatToman(order.totalRials)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
          <MapPin size={18} aria-hidden="true" />
          آدرس ارسال
        </div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-slate-400">گیرنده</div>
            <div className="font-bold text-slate-900 mt-0.5">{order.shipping.fullName}</div>
          </div>
          <div dir="ltr" className="text-right">
            <div className="text-xs text-slate-400">موبایل</div>
            <div className="font-bold text-slate-900 mt-0.5">{toPersianDigits(order.shipping.mobile)}</div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-slate-400">آدرس</div>
            <div className="font-bold text-slate-900 mt-0.5">
              {order.shipping.province}، {order.shipping.city} — {order.shipping.address}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-xs text-slate-400">کد پستی</div>
            <div className="font-bold text-slate-900 mt-0.5">{toPersianDigits(order.shipping.postalCode)}</div>
          </div>
        </div>
      </div>

      {order.note && (
        <div className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
          <div className="text-slate-900 font-black text-sm">توضیحات سفارش</div>
          <p className="mt-3 text-sm leading-7 text-slate-600 whitespace-pre-wrap">{order.note}</p>
        </div>
      )}
    </div>
  )
}
