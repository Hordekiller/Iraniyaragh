import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Image as ImageIcon, MapPin, Package } from 'lucide-react'
import { useAuth } from '../state/auth-context'
import { OrderTracking } from '../components/orders/OrderTracking'
import { LoadFailure } from '../components/feedback/LoadFailure'
import { isNotFound } from '../lib/load-error'
import { useCommerce } from '../services/commerce/context'
import {
  FULFILLMENT_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
} from '../services/commerce/types'
import { formatToman, toPersianDigits, formatTimestamp } from '../lib/format'
import { provinceNameForCode } from '../lib/iran'
import { ROUTES } from '../lib/routes'
import type { OrderDetail, OrderStatus } from '@iranyaragh/contracts'
import { useDocumentMeta } from '../lib/use-document-meta'

const STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-800 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  RETURNED: 'bg-slate-100 text-slate-700 border-slate-200',
}

export function OrderDetailPage() {
  useDocumentMeta({ title: 'جزئیات سفارش', noindex: true })
  const { orders } = useCommerce()
  const { state: authState, open } = useAuth()
  const { id = '' } = useParams<{ id: string }>()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const retry = useCallback(() => setReloadToken(current => current + 1), [])

  const authenticated = authState.restored && authState.phase === 'authenticated' && Boolean(authState.principal)

  useEffect(() => {
    if (!authenticated) return undefined
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setOrder(null)
      setNotFound(false)
      setFailed(false)
      try {
        const next = await orders.getOrder(id)
        if (cancelled) return
        setOrder(next)
      } catch (cause) {
        if (cancelled) return
        // A failed lookup is not proof the order is missing. Anything other
        // than NOT_FOUND — 500, offline, an expired session — is a failure the
        // customer can retry, not a missing order.
        if (isNotFound(cause)) {
          setNotFound(true)
        } else {
          setFailed(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [orders, id, authenticated, reloadToken])

  // A hard refresh or a deep link lands here before the silent session restore
  // has settled, so the sign-in wall must not be shown yet: doing so flashed
  // "sign in" at customers who were already signed in.
  if (!authState.restored) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال بررسی نشست...
      </p>
    )
  }

  if (!authenticated) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">برای مشاهده جزئیات سفارش وارد شوید</h1>
        <button type="button" onClick={open} className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          ورود / ثبتنام با موبایل
        </button>
      </div>
    )
  }

  if (loading) return <div className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">در حال بارگذاری سفارش...</div>

  if (failed) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20">
        <LoadFailure onRetry={retry} title="سفارش بارگذاری نشد" />
        <div className="text-center">
          <Link to={ROUTES.orders} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
            بازگشت به سفارشها
          </Link>
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">سفارش یافت نشد</h1>
        <p className="mt-2 text-slate-500 text-sm">سفارشی با این نشانی در حساب کاربری شما ثبت نشده است.</p>
        <Link to={ROUTES.orders} className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          بازگشت به سفارشها
        </Link>
      </div>
    )
  }

  const unpaid = order.status === 'PENDING_PAYMENT'
  const latestPayment = order.payments.at(-1) ?? null
  const provinceName = order.address ? provinceNameForCode(order.address.provinceCode) : null

  return (
    <div className="max-w-[960px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-black text-slate-900 text-lg lg:text-xl">
            سفارش <span dir="ltr">{order.number}</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">{formatTimestamp(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_CLASS[order.status]}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          {unpaid && (
            <Link
              to={ROUTES.payment(order.id)}
              className="h-10 px-5 rounded-full bg-[#FF4D00] text-white font-black inline-flex items-center hover:bg-[#E54400] transition"
            >
              وضعیت پرداخت
            </Link>
          )}
        </div>
      </div>

      <OrderTracking order={order} />

      <div className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
          <Package size={18} aria-hidden="true" />
          اقلام سفارش
        </div>
        <ul className="mt-4 divide-y divide-slate-100">
          {order.items.map(item => (
            <li key={item.variantId} className="flex items-center gap-4 py-3">
              <span className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 shrink-0">
                <ImageIcon size={22} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-sm truncate">{item.productTitle}</p>
                <div className="text-xs text-slate-400 mt-0.5">
                  {item.variantTitle ? `${item.variantTitle} • ` : ''}
                  <span dir="ltr">{item.sku}</span> • تعداد {toPersianDigits(item.quantity)}
                </div>
              </div>
              <span className="font-black text-slate-900 text-sm whitespace-nowrap">{formatToman(item.lineTotal.amount)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>جمع سفارش</span>
            <span>{formatToman(order.totals.subtotal.amount)}</span>
          </div>
          {Number(order.totals.discount.amount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>تخفیف</span>
              <span>−{formatToman(order.totals.discount.amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>هزینه ارسال</span>
            <span>{Number(order.totals.shipping.amount) > 0 ? formatToman(order.totals.shipping.amount) : 'رایگان'}</span>
          </div>
          <div className="flex justify-between font-black text-slate-900 text-base pt-1 border-t border-slate-100">
            <span>مبلغ نهایی</span>
            <span className="text-[#FF4D00]">{formatToman(order.totals.total.amount)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
        <div className="text-slate-900 font-black text-sm">وضعیت پرداخت و ارسال</div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <span className="rounded-xl bg-slate-50 px-3 py-2">
            پرداخت: {latestPayment ? PAYMENT_STATUS_LABEL[latestPayment.status] : 'ثبت نشده'}
          </span>
          <span className="rounded-xl bg-slate-50 px-3 py-2">
            ارسال: {order.fulfillment ? FULFILLMENT_STATUS_LABEL[order.fulfillment.status] : FULFILLMENT_STATUS_LABEL.PENDING}
          </span>
          <span className="rounded-xl bg-slate-50 px-3 py-2">روش ارسال: {order.shippingMethod.title}</span>
        </div>
      </div>

      {order.address && (
        <div className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
            <MapPin size={18} aria-hidden="true" />
            آدرس ارسال
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-slate-400">گیرنده</div>
              <div className="font-bold text-slate-900 mt-0.5">{order.address.recipient}</div>
            </div>
            <div dir="ltr" className="text-right">
              <div className="text-xs text-slate-400">موبایل</div>
              <div className="font-bold text-slate-900 mt-0.5">{toPersianDigits(order.address.mobile)}</div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-400">آدرس</div>
              <div className="font-bold text-slate-900 mt-0.5">
                {provinceName ?? order.address.provinceCode}، {order.address.city} — {order.address.address}
              </div>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-slate-400">کد پستی</div>
              <div className="font-bold text-slate-900 mt-0.5">{toPersianDigits(order.address.postalCode)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}