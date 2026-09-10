import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
<<<<<<< HEAD
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
=======
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
>>>>>>> b2d024c (feat(web): harden storefront purchase flow)
    </div>
  )
}
