import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Package, RefreshCw } from 'lucide-react'
import type { OrderSummary } from '@iranyaragh/contracts'
import { useOrderApi } from '../state/order-context'
import { useAuth } from '../state/auth-context'
import { formatTimestamp, formatToman, toPersianDigits } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { commerceErrorMessage } from '../services/commerce/errors'
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  orderStatusClass,
} from '../services/commerce/presentation'

export function OrdersPage() {
  const api = useOrderApi()
  const auth = useAuth()
  const [reload, setReload] = useState(0)
  const requestKey = `${auth.state.phase}:${reload}`
  const [result, setResult] = useState<{
    key: string
    items: OrderSummary[] | null
    error: unknown | null
  }>({ key: '', items: null, error: null })

  useEffect(() => {
    if (auth.state.phase !== 'authenticated') return
    let active = true
    api
      .listOrders()
      .then((page) => {
        if (active)
          setResult({ key: requestKey, items: page.items, error: null })
      })
      .catch((cause) => {
        if (active) setResult({ key: requestKey, items: null, error: cause })
      })
    return () => {
      active = false
    }
  }, [api, auth.state.phase, requestKey])

  const items = result.key === requestKey ? result.items : null
  const error = result.key === requestKey ? result.error : null

  if (auth.state.phase !== 'authenticated')
    return (
      <Centered
        title="برای مشاهده سفارش‌ها وارد شوید"
        description="سفارش‌ها فقط برای صاحب حساب نمایش داده می‌شوند."
        action={
          <button type="button" onClick={auth.open} className={buttonClass}>
            ورود / ثبت‌نام
          </button>
        }
      />
    )

  return (
    <div className="mx-auto max-w-[1080px] px-4 py-8 lg:px-6 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-700">حساب کاربری</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">
            سفارش‌های من
          </h1>
        </div>
        <Link
          to={ROUTES.home}
          className="text-sm font-bold text-slate-600 hover:text-amber-700"
        >
          بازگشت به فروشگاه
        </Link>
      </div>
      {items === null && !error && (
        <div
          role="status"
          aria-live="polite"
          className="mt-10 text-center text-slate-500"
        >
          در حال دریافت سفارش‌ها…
        </div>
      )}
      {Boolean(error) && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
        >
          <p>{commerceErrorMessage(error)}</p>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="mt-3 inline-flex items-center gap-2 underline"
          >
            <RefreshCw size={15} /> تلاش دوباره
          </button>
        </div>
      )}
      {items?.length === 0 && !error && (
        <Centered
          title="هنوز سفارشی ندارید"
          description="پس از ثبت سفارش، وضعیت پرداخت و ارسال از همین‌جا قابل پیگیری است."
          action={
            <Link to={ROUTES.home} className={buttonClass}>
              شروع خرید
            </Link>
          }
        />
      )}
      {items && items.length > 0 && (
        <ul className="mt-6 space-y-4">
          {items.map((order) => (
            <li key={order.id}>
              <Link
                to={ROUTES.order(order.id)}
                className="block rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-amber-400">
                      <Package size={20} />
                    </div>
                    <div>
                      <h2 className="font-black text-slate-950">
                        سفارش <span dir="ltr">{order.number}</span>
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTimestamp(order.createdAt)} ·{' '}
                        {toPersianDigits(order.itemCount)} کالا
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-bold ${orderStatusClass(order.status)}`}
                  >
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                </div>
                <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <span className="block text-xs text-slate-500">
                      مبلغ سفارش
                    </span>
                    <span className="mt-1 block font-black text-slate-950">
                      {formatToman(order.totals.total.amount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">پرداخت</span>
                    <span className="mt-1 block font-bold text-slate-800">
                      {order.payment.latestStatus
                        ? PAYMENT_STATUS_LABEL[order.payment.latestStatus]
                        : 'آغاز نشده'}
                    </span>
                  </div>
                  <div className="sm:text-left">
                    <span className="block text-xs text-slate-500">
                      تعداد تلاش پرداخت
                    </span>
                    <span className="mt-1 block font-bold text-slate-800">
                      {toPersianDigits(order.payment.attemptCount)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const buttonClass =
  'mx-auto mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-6 font-bold text-white hover:bg-black'
function Centered({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="mx-auto max-w-[620px] px-4 py-20 text-center">
      <h2 className="text-xl font-black text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-slate-500">{description}</p>
      {action}
    </div>
  )
}
