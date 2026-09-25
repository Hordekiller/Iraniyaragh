import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  CheckCircle2,
  Clock3,
  CreditCard,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import type { OrderDetail } from '@iranyaragh/contracts'
import { useOrderApi } from '../state/order-context'
import { useAuth } from '../state/auth-context'
import { formatTimestamp, formatToman } from '../lib/format'
import { ROUTES } from '../lib/routes'
import { commerceErrorMessage } from '../services/commerce/errors'
import { AuthApiError } from '../lib/auth/errors'
import {
  newPaymentIdempotencyKey,
  paymentRedirectUrl,
  redirectToPaymentGateway,
} from '../services/commerce/payment'
import { PAYMENT_STATUS_LABEL } from '../services/commerce/presentation'

export function PaymentPage({ returnMode = false }: { returnMode?: boolean }) {
  const api = useOrderApi()
  const auth = useAuth()
  const { id = '' } = useParams<{ id: string }>()
  const [reload, setReload] = useState(0)
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<{
    orderId: string
    cause: unknown
  } | null>(null)
  const [uncertainOrderId, setUncertainOrderId] = useState<string | null>(null)
  const paymentKey = useRef<{ orderId: string; key: string } | null>(null)
  const inFlight = useRef(false)
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
  const busy = busyOrderId === id
  const uncertain = uncertainOrderId === id
  const currentPaymentError = paymentError?.orderId === id ? paymentError.cause : null

  async function handlePayment() {
    if (
      returnMode ||
      !order ||
      order.status !== 'PENDING_PAYMENT' ||
      order.payment.latestStatus === 'PAID' ||
      inFlight.current ||
      uncertain
    ) return
    inFlight.current = true
    setBusyOrderId(id)
    setPaymentError(null)
    try {
      if (paymentKey.current?.orderId !== id)
        paymentKey.current = { orderId: id, key: newPaymentIdempotencyKey() }
      const payment = await api.initiatePayment(order.id, paymentKey.current.key)
      const redirectUrl = paymentRedirectUrl(
        payment,
        order.totals.total.amount,
      )
      if (!redirectUrl) {
        setUncertainOrderId(id)
        throw new Error('The gateway response did not match this order.')
      }
      redirectToPaymentGateway(redirectUrl)
    } catch (cause) {
      setPaymentError({ orderId: id, cause })
      if (cause instanceof AuthApiError) {
        if (
          ['PAYMENT_RESULT_UNCONFIRMED', 'TIMEOUT', 'NETWORK_ERROR', 'PARSE_ERROR'].includes(
            cause.code,
          )
        )
          setUncertainOrderId(id)
        if (['UPSTREAM_UNAVAILABLE', 'UNPROCESSABLE'].includes(cause.code))
          paymentKey.current = null
      } else {
        setUncertainOrderId(id)
      }
    } finally {
      inFlight.current = false
      setBusyOrderId((current) => (current === id ? null : current))
    }
  }

  if (auth.state.phase !== 'authenticated')
    return (
      <ResultCard
        icon={<CreditCard size={30} />}
        title="برای بررسی پرداخت وارد شوید"
        description="وضعیت پرداخت فقط از سرور و برای صاحب سفارش نمایش داده می‌شود."
        action={
          <button type="button" onClick={auth.open} className={primaryButton}>
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
        className="mx-auto max-w-[620px] px-4 py-20 text-center text-slate-500"
      >
        در حال بررسی وضعیت ثبت‌شده در سرور…
      </div>
    )
  if (error || !order)
    return (
      <ResultCard
        tone="error"
        icon={<XCircle size={30} />}
        title="وضعیت پرداخت دریافت نشد"
        description={commerceErrorMessage(error)}
        action={
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className={primaryButton}
          >
            <RefreshCw size={16} /> تلاش دوباره
          </button>
        }
      />
    )

  const latest = order.payment.latestStatus
  const verifiedPaid = order.status === 'PAID' && latest === 'PAID'
  const failed = latest === 'FAILED' || latest === 'CANCELLED'
  if (verifiedPaid)
    return (
      <ResultCard
        tone="success"
        icon={<CheckCircle2 size={32} />}
        title="پرداخت توسط سرور تأیید شد"
        description={`سفارش ${order.number} با مبلغ ${formatToman(order.totals.total.amount)} پرداخت شده است.`}
        details={`آخرین به‌روزرسانی: ${formatTimestamp(order.updatedAt)}`}
        action={
          <Link to={ROUTES.order(order.id)} className={primaryButton}>
            مشاهده جزئیات سفارش
          </Link>
        }
      />
    )

  if (order.status !== 'PENDING_PAYMENT' || latest === 'PAID')
    return (
      <ResultCard
        tone="error"
        icon={<ShieldAlert size={31} />}
        title="وضعیت پرداخت نیازمند بررسی است"
        description="وضعیت سفارش و پرداخت با هم تأیید نشده‌اند. پرداخت تازه‌ای آغاز نکنید و جزئیات سفارش را بررسی کنید."
        action={
          <Link to={ROUTES.order(order.id)} className={primaryButton}>
            مشاهده جزئیات سفارش
          </Link>
        }
      />
    )

  return (
    <ResultCard
      tone={failed ? 'error' : 'pending'}
      icon={failed ? <ShieldAlert size={31} /> : <Clock3 size={31} />}
      title={failed ? 'پرداخت تأیید نشد' : 'سفارش در انتظار پرداخت است'}
      description={
        failed
          ? `آخرین تلاش پرداخت «${latest ? PAYMENT_STATUS_LABEL[latest] : 'نامشخص'}» ثبت شده است. وضعیت سفارش تغییر نکرده است.`
          : returnMode
            ? 'نتیجهٔ بازگشت از درگاه قطعی نیست. وضعیت ثبت‌شده در سرور را بررسی کنید؛ در صورت کسر وجه بدون تأیید سفارش، با پشتیبانی تماس بگیرید.'
            : 'برای پرداخت، به درگاه زرین‌پال هدایت می‌شوید. موفقیت پرداخت فقط پس از تأیید سرور نمایش داده می‌شود.'
      }
      details={`سفارش ${order.number} · ${formatToman(order.totals.total.amount)}`}
      action={
        <div className="mt-6 flex flex-col gap-3">
          {Boolean(currentPaymentError) && (
            <p role="alert" className="text-sm font-bold text-red-700">
              {uncertain
                ? 'نتیجه آغاز پرداخت نامشخص است. پیش از تلاش دوباره، وضعیت سفارش را بررسی کنید و در صورت نیاز با پشتیبانی تماس بگیرید.'
                : paymentErrorMessage(currentPaymentError)}
            </p>
          )}
          {!returnMode && order.status === 'PENDING_PAYMENT' && !uncertain && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePayment()}
              className={primaryButton}
            >
              <CreditCard size={16} />
              {busy ? 'در حال اتصال به درگاه…' : 'پرداخت با زرین‌پال'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className={primaryButton}
          >
            <RefreshCw size={16} /> بررسی دوباره وضعیت
          </button>
          <Link
            to={ROUTES.order(order.id)}
            className="inline-flex h-11 items-center justify-center rounded-xl border-2 border-slate-950 px-6 font-black text-slate-950"
          >
            جزئیات سفارش
          </Link>
        </div>
      }
    />
  )
}

function paymentErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    switch (error.code) {
      case 'UPSTREAM_UNAVAILABLE':
        return 'درگاه پرداخت موقتاً در دسترس نیست. کمی بعد وضعیت سفارش را بررسی کنید.'
      case 'UNPROCESSABLE':
        return 'درگاه درخواست پرداخت را نپذیرفت. وضعیت سفارش را بررسی کنید.'
      case 'ORDER_STATE_CONFLICT':
      case 'PAYMENT_STATE_CONFLICT':
        return 'وضعیت سفارش یا پرداخت تغییر کرده است. وضعیت سفارش را دوباره بررسی کنید.'
    }
  }
  return commerceErrorMessage(error)
}

const primaryButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 font-black text-white hover:bg-black'
function ResultCard({
  icon,
  title,
  description,
  details,
  action,
  tone = 'pending',
}: {
  icon: React.ReactNode
  title: string
  description: string
  details?: string
  action: React.ReactNode
  tone?: 'pending' | 'success' | 'error'
}) {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'error'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-800'
  return (
    <div className="mx-auto max-w-[620px] px-4 py-12 sm:py-20">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${toneClass}`}
        >
          {icon}
        </div>
        <h1 className="mt-5 text-xl font-black text-slate-950">{title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">
          {description}
        </p>
        {details && (
          <p className="mt-3 text-xs font-bold text-slate-500">{details}</p>
        )}
        <div className="mt-6">{action}</div>
      </div>
    </div>
  )
}
