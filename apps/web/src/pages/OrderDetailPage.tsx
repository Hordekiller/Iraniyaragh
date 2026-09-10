import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
<<<<<<< HEAD
import { CreditCard, MapPin, Package, RefreshCw, Truck } from 'lucide-react'
import type { OrderDetail } from '@iranyaragh/contracts'
import { useOrderApi } from '../state/order-context'
import { useAuth } from '../state/auth-context'
import { formatTimestamp, formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { commerceErrorMessage } from '../services/commerce/errors'
import {
  FULFILLMENT_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  orderStatusClass,
} from '../services/commerce/presentation'

export function OrderDetailPage() {
  const api = useOrderApi()
  const auth = useAuth()
  const { id = '' } = useParams<{ id: string }>()
  const [reload, setReload] = useState(0)
  const requestKey = `${auth.state.phase}:${id}:${reload}`
  const [result, setResult] = useState<{
    key: string
    order: OrderDetail | null
    error: unknown | null
  }>({ key: '', order: null, error: null })

  useEffect(() => {
    if (auth.state.phase !== 'authenticated') return
    let active = true
    api
      .getOrder(id)
      .then((value) => {
        if (active) setResult({ key: requestKey, order: value, error: null })
      })
      .catch((cause) => {
        if (active) setResult({ key: requestKey, order: null, error: cause })
      })
    return () => {
      active = false
    }
  }, [api, auth.state.phase, id, requestKey])

  const order = result.key === requestKey ? result.order : null
  const error = result.key === requestKey ? result.error : null

  if (auth.state.phase !== 'authenticated')
    return (
      <Notice
        title="برای مشاهده سفارش وارد شوید"
        action={
          <button type="button" onClick={auth.open} className={buttonClass}>
            ورود / ثبت‌نام
          </button>
        }
      />
    )
  if (!order && !error)
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto max-w-[960px] px-4 py-20 text-center text-slate-500"
      >
        در حال دریافت جزئیات سفارش…
      </div>
    )
  if (error || !order)
    return (
      <Notice
        title="جزئیات سفارش دریافت نشد"
        description={commerceErrorMessage(error)}
        action={
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className={buttonClass}
          >
            <RefreshCw size={16} /> تلاش دوباره
          </button>
        }
      />
    )

  const deliveryEvent = order.timeline.find((entry) => entry.domain === 'FULFILLMENT' && entry.to === 'DELIVERED')

  return (
    <div className="mx-auto max-w-[960px] px-4 py-8 lg:px-6 lg:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to={ROUTES.orders} className="text-xs font-bold text-amber-700">
            بازگشت به سفارش‌ها
          </Link>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            سفارش <span dir="ltr">{order.number}</span>
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            ثبت‌شده در {formatTimestamp(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${orderStatusClass(order.status)}`}
          >
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          {order.status === 'PENDING_PAYMENT' && (
            <Link
              to={ROUTES.payment(order.id)}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950"
            >
              بررسی وضعیت پرداخت
=======
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
            </Link>
          )}
        </div>
      </div>

<<<<<<< HEAD
      <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 font-black text-slate-950">
          <Package size={19} /> اقلام سفارش
        </h2>
        <ul className="mt-4 divide-y divide-slate-100">
          {order.items.map((item) => (
            <li
              key={item.variantId}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-950">{item.productTitle}</p>
                {item.variantTitle && (
                  <p className="mt-1 text-xs text-slate-500">
                    {item.variantTitle}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  کد کالا: <span dir="ltr">{item.sku}</span> · تعداد{' '}
                  {toPersianDigits(item.quantity)}
                </p>
              </div>
              <span className="font-black text-slate-950">
                {formatToman(item.lineTotal.amount)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
          <MoneyRow label="جمع کالاها" amount={order.totals.subtotal.amount} />
          <MoneyRow label="تخفیف" amount={order.totals.discount.amount} />
          <MoneyRow label="ارسال" amount={order.totals.shipping.amount} />
          <MoneyRow
            label="مبلغ نهایی"
            amount={order.totals.total.amount}
            strong
          />
        </dl>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-[24px] border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950">
            <CreditCard size={19} /> پرداخت
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            آخرین وضعیت:{' '}
            <strong className="text-slate-950">
              {order.payment.latestStatus
                ? PAYMENT_STATUS_LABEL[order.payment.latestStatus]
                : 'پرداختی آغاز نشده'}
            </strong>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            تعداد تلاش‌ها: {toPersianDigits(order.payment.attemptCount)}
          </p>
          {order.payments.length > 0 && (
            <ul className="mt-4 space-y-2">
              {order.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="rounded-xl bg-slate-50 p-3 text-xs"
                >
                  <span className="font-bold">
                    {PAYMENT_STATUS_LABEL[payment.status]}
                  </span>
                  <span className="mr-2 text-slate-500">
                    {formatTimestamp(payment.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-[24px] border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950">
            <Truck size={19} /> ارسال
          </h2>
          <p className="mt-4 text-sm text-slate-600">
            روش:{' '}
            <strong className="text-slate-950">
              {order.shippingMethod.title}
            </strong>
          </p>
          <p className="mt-2 text-sm text-slate-600">
            وضعیت:{' '}
            <strong className="text-slate-950">
              {order.fulfillmentStatus
                ? FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]
                : 'هنوز آغاز نشده'}
            </strong>
          </p>
          {order.shipment && (
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p>حامل: <strong>{order.shipment.carrier}</strong></p>
              <p className="mt-1">کد رهگیری: <strong dir="ltr">{order.shipment.trackingCode}</strong></p>
              <p className="mt-1 text-xs">ثبت ارسال: {formatTimestamp(order.shipment.dispatchedAt)}</p>
              {order.shipment.status === 'DELIVERED' && (
                <p className="mt-1 text-xs">تحویل تأیید شد{deliveryEvent ? ` · ${formatTimestamp(deliveryEvent.createdAt)}` : ''}</p>
              )}
            </div>
          )}
        </section>
      </div>

      {order.address && (
        <section className="mt-4 rounded-[24px] border border-slate-200 bg-white p-5">
          <h2 className="flex items-center gap-2 font-black text-slate-950">
            <MapPin size={19} /> نشانی تحویل
          </h2>
          <div className="mt-4 text-sm leading-7 text-slate-700">
            <p className="font-bold text-slate-950">
              {order.address.recipient}
            </p>
            <p>
              {order.address.city}، {order.address.address}
            </p>
            <p>
              کد پستی: {toPersianDigits(order.address.postalCode)} · همراه:{' '}
              {toPersianDigits(order.address.mobile)}
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function MoneyRow({
  label,
  amount,
  strong = false,
}: {
  label: string
  amount: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${strong ? 'border-t border-slate-100 pt-3 text-base font-black text-slate-950' : 'text-slate-600'}`}
    >
      <dt>{label}</dt>
      <dd>{formatToman(amount)}</dd>
    </div>
  )
}
const buttonClass =
  'mx-auto mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 font-bold text-white hover:bg-black'
function Notice({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[620px] px-4 py-20 text-center">
      <h1 className="text-xl font-black text-slate-950">{title}</h1>
      {description && (
        <p className="mt-2 text-sm text-slate-500">{description}</p>
      )}
      {action}
=======
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
    </div>
  )
}
