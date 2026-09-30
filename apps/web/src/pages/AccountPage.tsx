import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, LogOut, Package, PackageCheck, RotateCcw, ShieldCheck, UserRound, Wallet } from 'lucide-react'
import { useAuth } from '../state/auth-context'
import { useToast } from '../components/feedback/toast-context'
import { AccountSessionsPanel } from '../components/account/AccountSessionsPanel'
import { useCommerce } from '../services/commerce/context'
import { commerceErrorMessage, ORDER_STATUS_LABEL } from '../services/commerce/types'
import { ROUTES } from '../lib/routes'
import { formatToman, formatTimestamp, toPersianDigits } from '../lib/format'
import { useDocumentMeta } from '../lib/use-document-meta'
import type { OrderStatus, OrderSummary } from '@iranyaragh/contracts'

const RECENT_LIMIT = 3
/** A total is "settled" once the order is paid and has not been cancelled/returned. */
const SETTLED_STATUSES = new Set<OrderStatus>(['PAID'])
/** The one order state that still needs something from the customer. */
const NEEDS_ACTION: OrderStatus = 'PENDING_PAYMENT'
const AUTH_LEVEL_LABEL = { CUSTOMER_OTP: 'ورود با پیامک', STAFF_MFA: 'ورود دو مرحله‌ای پرسنلی' } as const

/**
 * Sum of settled order totals.
 *
 * Amounts are strings in the contract, so an unparsable value is skipped rather
 * than coerced: a wrong "total paid" figure is worse than an undercount, and
 * `Number` would silently turn a malformed amount into `NaN`.
 */
function sumPaidRials(orders: readonly OrderSummary[]): number {
  return orders.reduce((sum, order) => {
    if (!SETTLED_STATUSES.has(order.status)) return sum
    const total = Number(order.totals.total.amount)
    return Number.isSafeInteger(total) ? sum + total : sum
  }, 0)
}

export function AccountPage() {
  useDocumentMeta({ title: 'حساب کاربری', noindex: true })
  const { state, controller } = useAuth()
  const { show } = useToast()
  const { orders } = useCommerce()
  const [all, setAll] = useState<OrderSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const retryOrders = () => {
    setAll(null)
    setError(null)
    setAttempt(n => n + 1)
  }

  const principal = state.principal
  const authenticated = state.restored && state.phase === 'authenticated' && Boolean(principal)

  useEffect(() => {
    if (!authenticated) return undefined
    let cancelled = false
    orders
      .listOrders()
      .then(list => {
        if (cancelled) return
        // Keep the whole list: the panel's totals and counts must cover every
        // order the API returned, not only the few rows it displays.
        setAll(list)
        setError(null)
      })
      .catch(cause => {
        if (cancelled) return
        setError(commerceErrorMessage(cause))
      })
    return () => {
      cancelled = true
    }
  }, [authenticated, orders, attempt])

  // See the note in PaymentPage: a deep link arrives before the silent restore
  // settles, and the sign-in wall must not flash at a signed-in customer.
  if (!state.restored) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال بررسی نشست...
      </p>
    )
  }

  if (!authenticated) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <UserRound size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">وارد حساب کاربری شوید</h1>
        <p className="mt-2 text-slate-500 text-sm">برای مشاهده حساب و سفارش‌های خود وارد شوید.</p>
        <button
          type="button"
          onClick={() => { void controller.open() }}
          className="inline-flex items-center gap-2 mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          ورود / ثبت‌نام
        </button>
      </div>
    )
  }

  const recent = all?.slice(0, RECENT_LIMIT) ?? null
  const orderCount = all?.length ?? 0
  const settledTotal = all ? sumPaidRials(all) : 0
  const needsAction = all?.filter(order => order.status === NEEDS_ACTION) ?? []

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-6">
      <h1 className="font-black text-slate-900 text-lg lg:text-xl">حساب کاربری</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[24px] border border-slate-100 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#FF4D00]/10 text-[#C2410C] flex items-center justify-center">
              <UserRound size={26} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="font-black text-slate-900">حساب کاربری شما</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {principal ? AUTH_LEVEL_LABEL[principal.authenticationLevel] : ''}
              </div>
            </div>
          </div>

          {/* Only facts the API actually reports. The storefront has no customer
              profile endpoint, so no name, address or e-mail is invented here. */}
          {principal && (
            <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-slate-500">
                  <ShieldCheck size={14} aria-hidden="true" /> شناسهٔ کاربر
                </dt>
                <dd dir="ltr" className="font-bold text-slate-900 truncate">{principal.userId}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">شروع این نشست</dt>
                <dd className="font-bold text-slate-900">{formatTimestamp(principal.authenticatedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">انقضای دسترسی</dt>
                <dd className="font-bold text-slate-900">{formatTimestamp(principal.accessExpiresAt)}</dd>
              </div>
            </dl>
          )}
          <p className="mt-3 text-[11px] leading-5 text-slate-500">
            توکن دسترسی فقط در حافظهٔ همین صفحه نگهداری می‌شود و هرگز در حافظهٔ مرورگر ذخیره نمی‌شود. نشست با
            کوکی امنِ سرور پس از نوسازی صفحه هم برقرار می‌ماند؛ برای پایان دادن به آن از «خروج از حساب» یا
            لغو نشست‌های فعال در پایین همین صفحه استفاده کنید.
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { void controller.logout(); show('از حساب خارج شدید') }}
              className="h-11 rounded-full border-2 border-slate-900 text-slate-900 font-black hover:bg-slate-900 hover:text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              <span className="inline-flex items-center justify-center gap-2">
                <LogOut size={16} aria-hidden="true" />
                خروج از این دستگاه
              </span>
            </button>
            <Link
              to={ROUTES.orders}
              className="h-11 rounded-full border-2 border-slate-200 text-slate-700 font-black hover:border-slate-900 transition flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              <Package size={16} aria-hidden="true" />
              همهٔ سفارش‌ها
            </Link>
          </div>
        </div>

        <Link
          to={ROUTES.orders}
          className="rounded-[24px] border border-slate-100 bg-white p-6 hover:border-slate-200 hover:shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Package size={26} aria-hidden="true" />
            </div>
            <div>
              <div className="font-black text-slate-900">سفارش‌های من</div>
              <div className="text-xs text-slate-400 mt-0.5">مشاهده و پیگیری سفارش‌ها</div>
            </div>
          </div>
        </Link>
      </div>

      {needsAction.length > 0 && (
        <section
          aria-labelledby="account-action-heading"
          className="mt-4 rounded-[24px] border border-amber-200 bg-amber-50 p-5 lg:p-6"
        >
          <h2 id="account-action-heading" className="flex items-center gap-2 font-black text-amber-900 text-sm">
            <CreditCard size={18} aria-hidden="true" />
            نیازمند اقدام شما
          </h2>
          <p className="mt-1 text-xs leading-6 text-amber-800">
            {toPersianDigits(needsAction.length)} سفارش در انتظار پرداخت است و تا پرداخت نشود ارسال نمی‌شود.
          </p>
          <ul className="mt-3 space-y-2">
            {needsAction.map(order => (
              <li key={order.id}>
                <Link
                  to={ROUTES.payment(order.id)}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-amber-200 px-4 py-3 hover:border-amber-400 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                >
                  <span className="text-sm font-bold text-slate-900">
                    سفارش <span dir="ltr">{order.number}</span>
                    <span className="mr-2 text-xs font-normal text-slate-500">
                      {formatToman(order.totals.total.amount)}
                    </span>
                  </span>
                  <span className="h-9 px-4 rounded-full bg-amber-600 text-white text-xs font-black inline-flex items-center hover:bg-amber-700 transition">
                    پرداخت
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="account-orders-heading" className="mt-4 rounded-[24px] border border-slate-100 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 id="account-orders-heading" className="font-black text-slate-900">خلاصه سفارش‌ها</h2>
          <Link to={ROUTES.orders} className="text-xs font-bold text-[#C2410C] hover:underline">همه سفارش‌ها</Link>
        </div>

        {error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-bold">{error}</p>
            <button
              type="button"
              onClick={retryOrders}
              className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-red-200 bg-white px-4 text-xs font-bold text-red-800 transition hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
            >
              <RotateCcw size={14} aria-hidden="true" />
              تلاش دوباره
            </button>
          </div>
        ) : all === null ? (
          <p role="status" className="mt-4 text-sm text-slate-500">در حال دریافت سفارش‌ها...</p>
        ) : all.length === 0 ? (
          <div className="mt-4">
            <p className="text-sm text-slate-500">هنوز سفارشی ثبت نشده است.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to={ROUTES.products}
                className="h-10 px-4 rounded-full bg-[#0F172A] text-white text-xs font-black inline-flex items-center hover:bg-black transition"
              >
                مشاهده کالاها
              </Link>
              <Link
                to={ROUTES.categories}
                className="h-10 px-4 rounded-full border border-slate-200 text-slate-700 text-xs font-black inline-flex items-center hover:border-slate-900 transition"
              >
                مرور دسته‌بندی‌ها
              </Link>
            </div>
          </div>
        ) : (
          <>
            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs text-slate-500">
                  <Package size={14} aria-hidden="true" /> کل سفارش‌ها
                </dt>
                <dd className="mt-1 font-black text-slate-900">{toPersianDigits(orderCount)}</dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs text-slate-500">
                  <PackageCheck size={14} aria-hidden="true" /> آخرین وضعیت
                </dt>
                <dd className="mt-1 font-black text-slate-900">
                  {recent && recent[0] ? ORDER_STATUS_LABEL[recent[0].status] : '—'}
                </dd>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <dt className="flex items-center gap-2 text-xs text-slate-500">
                  <Wallet size={14} aria-hidden="true" /> مجموع پرداخت‌شده
                </dt>
                <dd className="mt-1 font-black text-slate-900">{formatToman(settledTotal)}</dd>
              </div>
            </dl>

            <ul className="mt-4 divide-y divide-slate-100">
              {all.slice(0, RECENT_LIMIT).map(order => (
                <li key={order.id}>
                  {/* The detail route is keyed by the order id, not the human
                      order number: `/orders/:id` feeds `getOrder(id)`. */}
                  <Link
                    to={ROUTES.order(order.id)}
                    className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[#C2410C] transition"
                  >
                    <span className="font-bold text-slate-900">سفارش <span dir="ltr">{order.number}</span></span>
                    <span className="text-xs text-slate-500">{formatTimestamp(order.createdAt)}</span>
                    <span className="text-xs font-bold text-slate-700">{ORDER_STATUS_LABEL[order.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <AccountSessionsPanel />
    </div>
  )
}
