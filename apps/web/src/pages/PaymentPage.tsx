import { useEffect, useState } from 'react'
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
import { PAYMENT_STATUS_LABEL } from '../services/commerce/presentation'

export function PaymentPage() {
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

  return (
    <ResultCard
      tone={failed ? 'error' : 'pending'}
      icon={failed ? <ShieldAlert size={31} /> : <Clock3 size={31} />}
      title={failed ? 'پرداخت تأیید نشد' : 'سفارش در انتظار پرداخت است'}
      description={
        failed
          ? `آخرین تلاش پرداخت «${latest ? PAYMENT_STATUS_LABEL[latest] : 'نامشخص'}» ثبت شده است. وضعیت سفارش تغییر نکرده است.`
          : 'درگاه پرداخت عملیاتی هنوز به این نسخه متصل نشده است؛ هیچ مبلغی از این صفحه دریافت و هیچ پرداختی موفق فرض نمی‌شود.'
      }
      details={`سفارش ${order.number} · ${formatToman(order.totals.total.amount)}`}
      action={
        <div className="mt-6 flex flex-col gap-3">
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
