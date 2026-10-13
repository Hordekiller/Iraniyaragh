import { useEffect, useState } from 'react'
import type { CreditSaleReturns } from '@iranyaragh/contracts'
import { useAuth } from '../../state/auth-context'
const rial = (value: string) => `${new Intl.NumberFormat('fa-IR').format(BigInt(value))} ریال`
export function CreditReturns({ orderId }: { orderId: string }) {
  const { request } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<CreditSaleReturns | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  useEffect(() => {
    if (!attempt) return
    let active = true
    const scoped = request.forCurrentPrincipal()
    void scoped<CreditSaleReturns>(`/api/v1/customers/me/credit/orders/${encodeURIComponent(orderId)}/returns`).then(result => { if (active) setData(result.data) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [attempt, request, orderId])
  return <section className="mt-4 rounded-xl border border-slate-200 p-4" aria-label="برگشت و بازپرداخت فروش نسیه">
    <button type="button" disabled={loading} onClick={() => { setLoading(true); setError(false); setAttempt(value => value + 1) }} className="font-bold underline">{attempt ? 'بازخوانی برگشت و بازپرداخت' : 'مشاهدهٔ برگشت و بازپرداخت'}</button>
    {loading && <p role="status">در حال دریافت اسناد برگشت…</p>}
    {error && <p role="alert">اسناد برگشت دریافت نشد؛ اتصال را بررسی و دوباره تلاش کنید.</p>}
    {!loading && !error && data && (data.items.length ? <ul className="mt-3 space-y-3">{data.items.map(row => <li key={row.id} className="border-t pt-3">
      <p>{row.kind === 'CANCEL' ? 'لغو فروش' : 'مرجوعی کالا'}: {rial(row.amount.amount)}</p>
      <p>کاهش بدهی: {rial(row.debtCredit.amount)}</p>
      <p>وجه قابل‌برگشت: {rial(row.refundDue.amount)}</p>
      <p>بازپرداخت ثبت‌شده: {rial(row.refunded.amount)}</p>
      <p>بازپرداخت باقی‌مانده: {rial(row.refundRemaining.amount)}</p>
    </li>)}</ul> : <p className="mt-3">برای این فروش سند برگشت ثبت نشده است.</p>)}
  </section>
}
