import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
            </Link>
          )}
        </div>
      </div>

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
    </div>
  )
}
