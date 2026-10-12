import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { CreditStatement } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { ROUTES } from '../lib/routes'
import { AccountNavigation, SessionRestoring } from '../components/account/AccountNavigation'
import { formatTimestamp } from '../lib/format'

const rial = (value: string) => `${new Intl.NumberFormat('fa-IR').format(BigInt(value))} ریال`
const financialStatus = { UNPAID: 'پرداخت‌نشده', PARTIALLY_PAID: 'پرداخت جزئی', PAID: 'تسویه‌شده', OVERDUE: 'سررسید گذشته' }
export function AccountCreditPage() {
  const { state, restored, open, identityVersion } = useAuth()
  if (state.phase !== 'authenticated' && (!restored || state.restoring)) return <SessionRestoring />
  if (state.phase !== 'authenticated') return <div className="mx-auto max-w-[720px] px-4 py-20 text-center"><h1 className="text-xl font-black">برای مشاهدهٔ صورتحساب وارد شوید</h1><button type="button" onClick={open} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">ورود / ثبت‌نام</button></div>
  return <CreditPanel key={`${identityVersion}:${state.principal?.userId}`} />
}
function CreditPanel() {
  const { request } = useAuth()
  const [statement, setStatement] = useState<CreditStatement | null>(null)
  const [loading, setLoading] = useState(true); const [error, setError] = useState(false)
  const [offset, setOffset] = useState(0); const [reload, setReload] = useState(0)
  useEffect(() => {
    let current = true
    const scoped = request.forCurrentPrincipal()
    void scoped<CreditStatement>(`/api/v1/customers/me/credit?offset=${offset}&limit=25`).then(result => {
      if (current) setStatement(result.data)
    }).catch(() => { if (current) setError(true) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [request, offset, reload])
  return <div className="mx-auto max-w-[1040px] px-4 py-8 lg:px-6">
    <Link to={ROUTES.account} className="font-bold text-slate-700 hover:text-orange-700">بازگشت به حساب</Link>
    <h1 className="mt-4 text-2xl font-black text-slate-950">صورتحساب و بدهی من</h1>
    <p className="mt-2 text-sm text-slate-600">ماندهٔ خریدهای اعتباری ثبت‌شده و اسناد بدهی حساب شما</p>
    <AccountNavigation />
    {loading && <p role="status">در حال دریافت صورتحساب…</p>}
    {error && <div role="alert" className="my-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">صورتحساب دریافت نشد؛ اتصال را بررسی کنید.<button type="button" disabled={loading} onClick={() => { setLoading(true); setError(false); setReload(value => value + 1) }} className="mr-3 font-bold underline">تلاش دوباره</button></div>}
    {!loading && !error && statement && <>
      {!statement.account ? <p className="rounded-2xl border border-slate-200 bg-white p-5">حساب اعتباری برای شما ثبت نشده است.</p> : <section aria-label="ماندهٔ اعتبار" className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="font-bold">بدهی باز: {rial(statement.account.outstanding.amount)}</p>
        <p className="mt-2">سررسید گذشته: {rial(statement.account.overdue.amount)}</p>
        <p className="mt-2">اعتبار باقی‌مانده: {rial(statement.account.availableCredit.amount)}</p>
        <p className="mt-2">حساب اعتباری {statement.account.status === 'ACTIVE' ? 'فعال' : 'تعلیق‌شده'} است.</p>
      </section>}
      {statement.documents.length === 0 ? <p className="mt-5 text-slate-600">سند بدهی ثبت‌شده‌ای ندارید.</p> : <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-right text-sm"><caption className="p-3 font-bold">اسناد بدهی شما</caption><thead className="bg-slate-50"><tr>{['سند', 'مبلغ اصل', 'مبلغ اصلاح‌شده', 'بدهی باز', 'سررسید', 'وضعیت'].map(label => <th scope="col" className="p-3 whitespace-nowrap" key={label}>{label}</th>)}</tr></thead>
          <tbody>{statement.documents.map(document => <tr key={document.id} className="border-t border-slate-100">
            <th scope="row" className="p-3">ماندهٔ اول دوره</th><td className="p-3 whitespace-nowrap">{rial(document.originalAmount.amount)}</td><td className="p-3 whitespace-nowrap">{rial(document.effectivePrincipal.amount)}</td><td className="p-3 whitespace-nowrap">{rial(document.outstanding.amount)}</td><td className="p-3 whitespace-nowrap">{formatTimestamp(document.dueAt)}</td><td className="p-3 whitespace-nowrap">{financialStatus[document.status]}</td>
          </tr>)}</tbody></table>
      </div>}
      <nav aria-label="صفحه‌بندی صورتحساب" className="mt-4 flex gap-3"><button type="button" disabled={offset === 0 || loading} onClick={() => { setLoading(true); setError(false); setOffset(value => Math.max(0, value - 25)) }} className="rounded-lg border px-4 py-2 disabled:opacity-40">صفحهٔ قبل</button><button type="button" disabled={offset + 25 >= statement.total || loading} onClick={() => { setLoading(true); setError(false); setOffset(value => value + 25) }} className="rounded-lg border px-4 py-2 disabled:opacity-40">صفحهٔ بعد</button></nav>
    </>}
  </div>
}
