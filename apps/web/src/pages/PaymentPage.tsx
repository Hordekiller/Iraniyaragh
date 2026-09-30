import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, CreditCard, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import { useAuth } from '../state/auth-context'
import { useCommerce } from '../services/commerce/context'
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../services/commerce/types'
import { LoadFailure } from '../components/feedback/LoadFailure'
import { isNotFound } from '../lib/load-error'
import { formatToman, formatTimestamp } from '../lib/format'
import { ROUTES } from '../lib/routes'
import type { OrderDetail } from '@iranyaragh/contracts'
import { useDocumentMeta } from '../lib/use-document-meta'

/**
 * Order status / payment handoff.
 *
 * The storefront never simulates a successful payment: until an online gateway
 * is wired, a created order stays in `PENDING_PAYMENT` and this page reflects
 * the server's actual status. «تجدید وضعیت» re-reads the order so a payment
 * completed elsewhere is picked up.
 */
export function PaymentPage() {
  useDocumentMeta({ title: 'پرداخت', noindex: true })
  const { state: authState, open } = useAuth()
  const { orders } = useCommerce()
  const { id = '' } = useParams<{ id: string }>()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [failed, setFailed] = useState(false)
  const [stale, setStale] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const retry = useCallback(() => setReloadToken(current => current + 1), [])

  const authenticated = authState.restored && authState.phase === 'authenticated' && Boolean(authState.principal)
  const latestPayment = order?.payments[0] ?? null

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
        // Only the API's own NOT_FOUND means the order is really not this
        // customer's. A 500, an offline request or an expired session must not
        // be reported as "this order is not yours".
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

  // A refresh failure keeps whatever is already on screen: the order is still
  // real, only the re-read failed.
  function reload() {
    setLoading(true)
    orders
      .getOrder(id)
      .then(o => {
        setOrder(o)
        setNotFound(false)
        setFailed(false)
        setStale(false)
        setLoading(false)
      })
      .catch(() => {
        // The order on screen is still real; only the re-read failed, so it
        // stays and the customer is told the refresh did not go through.
        setStale(true)
        setLoading(false)
      })
  }

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
      <div className="max-w-[560px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">برای دیدن وضعیت پرداخت وارد شوید</h1>
        <button type="button" onClick={open} className="inline-flex items-center mt-6 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition">
          ورود / ثبتنام با موبایل
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <p role="status" className="max-w-[1280px] mx-auto px-4 py-20 text-center text-slate-500">
        در حال خواندن وضعیت سفارش از سرور...
      </p>
    )
  }

  if (failed) {
    return (
      <div className="max-w-[560px] mx-auto px-4 py-20">
        <LoadFailure onRetry={retry} title="وضعیت پرداخت بارگذاری نشد" />
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to={ROUTES.orders}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            سفارش‌های من
          </Link>
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 py-20 text-center">
        <h1 className="font-black text-slate-900 text-xl">سفارش یافت نشد</h1>
        <p className="mt-2 text-sm text-slate-500">
          سفارشی با این نشانی در حساب کاربری شما ثبت نشده است.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to={ROUTES.orders}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-[#0F172A] text-white font-bold hover:bg-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
          >
            سفارش‌های من
          </Link>
          <Link
            to={ROUTES.products}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-full border border-slate-200 text-slate-700 font-bold hover:border-slate-900 transition"
          >
            ادامهٔ خرید
          </Link>
        </div>
      </div>
    )
  }

  if (order.status === 'PAID') {
    return (
      <div className="max-w-[560px] mx-auto px-4 py-10">
        <div className="rounded-[28px] border border-slate-100 bg-white p-6 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 size={32} aria-hidden="true" />
          </div>
          <h1 className="mt-4 font-black text-slate-900 text-xl">پرداخت با موفقیت انجام شد</h1>
          <p className="mt-2 text-sm text-slate-500">
            سفارش <span dir="ltr" className="font-bold text-slate-900">{order.number}</span> پرداخت شده است.
          </p>
          <p className="mt-3 text-sm text-slate-600">
            مبلغ پرداختشده: <span className="font-black text-[#FF4D00]">{formatToman(order.totals.total.amount)}</span>
          </p>
          {latestPayment && (
            <p className="mt-1 text-xs text-slate-500">
              ثبت‌شده در سرور: {PAYMENT_STATUS_LABEL[latestPayment.status]} ·{' '}
              {formatTimestamp(latestPayment.updatedAt)}
            </p>
          )}
          <p className="mt-3 inline-flex items-start gap-1.5 rounded-2xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 text-right">
            <Info size={14} aria-hidden="true" className="mt-1 shrink-0" />
            این نتیجه از وضعیت ثبت‌شدهٔ سفارش در سرور خوانده شده است؛ پرداخت صرفاً با بازگشت به درگاه تأیید نمی‌شود.
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
      </div>
    )
  }

  return (
    <div className="max-w-[560px] mx-auto px-4 py-10">
      <div className="rounded-[28px] border border-slate-100 bg-white p-6 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 text-slate-900 flex items-center justify-center">
          <CreditCard size={30} aria-hidden="true" />
        </div>
        <h1 className="mt-4 font-black text-slate-900 text-xl">{ORDER_STATUS_LABEL[order.status]}</h1>
        <p className="mt-1 text-xs text-slate-400">سفارش {order.number} • {formatTimestamp(order.createdAt)}</p>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-right space-y-2">
          <div className="flex justify-between text-sm text-slate-600">
            <span>مبلغ قابل پرداخت</span>
            <span className="font-black text-[#FF4D00]">{formatToman(order.totals.total.amount)}</span>
          </div>
          {order.status === 'PENDING_PAYMENT' && (
            <div className="flex justify-between text-sm text-slate-600">
              <span className="flex items-center gap-1.5"><Clock size={14} /> مهلت رزرو</span>
              <span className="font-bold">{formatTimestamp(order.reservationExpiresAt)}</span>
            </div>
          )}
        </div>

        <p className="mt-5 text-sm leading-6 text-slate-600">
          {order.status === 'PENDING_PAYMENT'
            ? 'پرداخت آنلاین هنوز فعال نشده است؛ سفارش شما در وضعیت «در انتظار پرداخت» ثبت شده و موجودی برای شما رزرو شده است. پس از فعالسازی درگاه، از همین صفحه وضعیت را بهروز کنید.'
            : 'این سفارش در وضعیتی نیست که پرداخت آن ممکن باشد. جزئیات کامل آن در صفحهٔ سفارش آمده است.'}
        </p>

        {order.status === 'CANCELLED' && (
          <p className="mt-3 inline-flex items-start gap-1.5 rounded-2xl bg-red-50 border border-red-200 p-3 text-xs leading-6 text-red-700 text-right">
            <TriangleAlert size={14} aria-hidden="true" className="mt-1 shrink-0" />
            این سفارش لغو شده و رزرو موجودی آن آزاد شده است.
          </p>
        )}

        {order.payments.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-right">
            {order.payments.slice(0, 3).map(payment => (
              <li key={payment.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                تلاش پرداخت: <span className="font-bold text-slate-800">{PAYMENT_STATUS_LABEL[payment.status]}</span> ·{' '}
                {formatToman(payment.amount.amount)} · {formatTimestamp(payment.createdAt)}
              </li>
            ))}
          </ul>
        )}

        {stale && (
          <p role="alert" className="mt-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 p-3 text-sm font-bold">
            وضعیت تازه‌ای دریافت نشد. اطلاعات بالا آخرین وضعیتی است که از سرور خوانده شده است.
          </p>
        )}

        <button
          type="button"
          onClick={reload}
          className="mt-5 w-full h-12 rounded-full bg-[#0F172A] text-white font-black hover:bg-black transition inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <RefreshCw size={16} aria-hidden="true" /> تجدید وضعیت
        </button>

        <div className="mt-4 flex flex-col gap-2">
          <Link to={ROUTES.order(order.id)} className="text-xs font-bold text-slate-500 hover:text-slate-900">
            مشاهده جزئیات سفارش
          </Link>
          <Link to={ROUTES.home} className="text-xs font-bold text-slate-500 hover:text-slate-900">
            بازگشت به فروشگاه
          </Link>
        </div>
      </div>
    </div>
  )
}