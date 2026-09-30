import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCommerce } from '../services/commerce/context'
import { commerceErrorMessage, FULFILLMENT_STATUS_LABEL, ORDER_STATUS_LABEL } from '../services/commerce/types'
import { formatToman, toPersianDigits, formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { OrderStatus, OrderSummary } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { useDocumentMeta } from '../lib/use-document-meta'

/**
 * Order-tracking filters.
 *
 * The buckets are a view over exactly what the API returned: no order is hidden
 * and no order is counted twice, so the numbers next to each chip can always be
 * checked against the list below. `PENDING_PAYMENT` is separated from the other
 * open orders because it is the only state that still needs the customer.
 */
type FilterId = 'ALL' | 'NEEDS_ACTION' | 'PAID' | 'CLOSED'

const FILTERS: readonly { id: FilterId; label: string }[] = [
  { id: 'ALL', label: 'همه' },
  { id: 'NEEDS_ACTION', label: 'در انتظار پرداخت' },
  { id: 'PAID', label: 'پرداخت‌شده' },
  { id: 'CLOSED', label: 'لغوشده و مرجوعی' },
]

const CLOSED_STATUSES: readonly OrderStatus[] = ['CANCELLED', 'RETURNED']

function matchesFilter(order: OrderSummary, filter: FilterId): boolean {
  if (filter === 'ALL') return true
  if (filter === 'NEEDS_ACTION') return order.status === 'PENDING_PAYMENT'
  if (filter === 'PAID') return order.status === 'PAID'
  return CLOSED_STATUSES.includes(order.status)
}

const STATUS_CLASS: Record<OrderStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDING_PAYMENT: 'bg-amber-50 text-amber-800 border-amber-200',
  PAID: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
  RETURNED: 'bg-slate-100 text-slate-700 border-slate-200',
}

export function OrdersPage() {
  useDocumentMeta({ title: 'سفارش‌های من', noindex: true })
  const { orders } = useCommerce()
  const { state: authState, open } = useAuth()
  const [items, setItems] = useState<OrderSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('ALL')

  const load = useCallback(() => {
    if (!authState.restored || authState.phase !== 'authenticated') return
    let cancelled = false
    orders
      .listOrders()
      .then(list => {
        if (cancelled) return
        setItems(list)
        setError(null)
      })
      .catch(cause => {
        if (cancelled) return
        setError(commerceErrorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [authState.restored, authState.phase, orders])

  useEffect(() => load(), [load])

  const visible = items?.filter(order => matchesFilter(order, filter)) ?? null

  // A deep link arrives before the silent restore settles; showing the sign-in
  // wall then would flash it at customers who are already signed in.
  if (!authState.restored) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال بررسی نشست...
      </p>
    )
  }

  if (authState.phase !== 'authenticated') {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">برای مشاهدهٔ سفارش‌ها وارد شوید</h1>
        <p className="mt-2 text-slate-500 text-sm">سابقهٔ سفارش‌ها فقط برای صاحب همین حساب نمایش داده می‌شود.</p>
        <button
          type="button"
          onClick={open}
          className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="font-black text-slate-900 text-lg lg:text-xl">سفارش‌های من</h1>
        <Link to={ROUTES.products} className="text-xs font-bold text-slate-600 hover:text-slate-900">
          ادامهٔ خرید
        </Link>
      </div>

      {items === null && !error && (
        <p role="status" className="mt-8 text-slate-500 text-sm" aria-live="polite">در حال دریافت سفارش‌ها...</p>
      )}

      {error && (
        <div role="alert" className="mt-8 rounded-2xl bg-red-50 border border-red-200 text-red-700 p-4 text-sm font-bold">
          <p>{error}</p>
          {items !== null && items.length > 0 && (
            // The list below survives a failed refresh on purpose, so say plainly
            // that it is the last data the server confirmed rather than implying
            // it is current.
            <p className="mt-1 font-normal text-red-700/90">
              فهرست زیر آخرین اطلاعاتی است که سرور تأیید کرده و ممکن است به‌روز نباشد.
            </p>
          )}
          <button
            type="button"
            onClick={() => { load() }}
            className="mt-3 h-9 px-4 rounded-full border border-red-300 text-xs font-bold hover:bg-red-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            تلاش دوباره
          </button>
        </div>
      )}

      {items !== null && items.length === 0 && !error && (
        <div className="mt-8">
          <p className="text-slate-600 text-sm">هنوز سفارشی ثبت نکرده‌اید.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to={ROUTES.products}
              className="h-10 px-4 rounded-full bg-[#0F172A] text-white text-xs font-black inline-flex items-center hover:bg-black transition"
            >
              مشاهدهٔ کالاها
            </Link>
            <Link
              to={ROUTES.categories}
              className="h-10 px-4 rounded-full border border-slate-200 text-slate-700 text-xs font-black inline-flex items-center hover:border-slate-900 transition"
            >
              مرور دسته‌بندی‌ها
            </Link>
          </div>
        </div>
      )}

      {visible !== null && items !== null && items.length > 0 && (
        <>
          <div role="group" aria-label="فیلتر وضعیت سفارش‌ها" className="mt-6 flex flex-wrap gap-2">
            {FILTERS.map(option => {
              const count = items.filter(order => matchesFilter(order, option.id)).length
              const active = filter === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  aria-pressed={active}
                  className={`h-9 px-3.5 rounded-full border text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] ${
                    active
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-900'
                  }`}
                >
                  {option.label}
                  <span className={active ? 'text-white/80' : 'text-slate-400'}>({toPersianDigits(count)})</span>
                </button>
              )
            })}
          </div>

          <div className="mt-4 space-y-4">
          {visible.map(order => (
            <div key={order.id} className="rounded-[20px] border border-slate-100 bg-white p-4 lg:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link to={ROUTES.order(order.id)} className="font-black text-slate-900 hover:text-[#C2410C]">
                    سفارش <span dir="ltr">{order.number}</span>
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5">{formatTimestamp(order.createdAt)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${STATUS_CLASS[order.status]}`}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                  <span className="font-black text-[#C2410C]">{formatToman(order.totals.total.amount)}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="rounded-xl bg-slate-50 px-2.5 py-1.5">
                  {toPersianDigits(order.itemCount)} کالا
                </span>
                {order.fulfillmentStatus && (
                  <span className="rounded-xl bg-slate-50 px-2.5 py-1.5">
                    {FULFILLMENT_STATUS_LABEL[order.fulfillmentStatus]}
                  </span>
                )}
                {order.status === 'PENDING_PAYMENT' && (
                  <Link
                    to={ROUTES.payment(order.id)}
                    className="h-9 px-4 rounded-full bg-amber-600 text-white text-xs font-black inline-flex items-center hover:bg-amber-700 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                  >
                    پرداخت این سفارش
                  </Link>
                )}
              </div>
            </div>
          ))}
          </div>

          {visible.length === 0 && (
            <p className="mt-6 rounded-2xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-600">
              سفارشی با این وضعیت ندارید.
            </p>
          )}
        </>
      )}
    </div>
  )
}