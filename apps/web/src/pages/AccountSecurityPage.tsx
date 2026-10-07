import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw, Shield, Smartphone } from 'lucide-react'
import type { SessionListResponse, SessionSummary } from '@iranyaragh/contracts'
import { useAuth } from '../state/auth-context'
import { ROUTES } from '../lib/routes'
import { AccountNavigation, SessionRestoring } from '../components/account/AccountNavigation'
import { formatTimestamp } from '../lib/format'

export function AccountSecurityPage() {
  const { state, open, restored } = useAuth()
  if (state.phase !== 'authenticated' && (!restored || state.restoring)) return <SessionRestoring />
  if (state.phase !== 'authenticated') return <div className="mx-auto max-w-[720px] px-4 py-20 text-center"><h1 className="text-xl font-black">برای مشاهده امنیت حساب وارد شوید</h1><button type="button" onClick={open} className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">ورود / ثبت‌نام</button></div>
  return <SecurityPanel key={state.principal?.userId} />
}

function SecurityPanel() {
  const { request, controller } = useAuth()
  const inFlight = useRef(false)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    void request<SessionListResponse['data']>('/api/v1/auth/sessions').then((result) => {
      if (active) { setSessions(result.data.sessions); setError(null) }
    }).catch(() => { if (active) setError('نشست‌های فعال دریافت نشدند. دوباره تلاش کنید.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [request, reload])

  async function revoke(session: SessionSummary) {
    if (inFlight.current) return
    if (!window.confirm(`نشست «${session.deviceName || 'دستگاه مشتری'}» بسته شود؟`)) return
    inFlight.current = true
    setBusyId(session.sessionId)
    setError(null)
    try {
      await request<Record<string, never>>(`/api/v1/auth/sessions/${encodeURIComponent(session.sessionId)}`, { method: 'DELETE' })
      if (session.current) await controller.logout()
      else setSessions((current) => current.filter((item) => item.sessionId !== session.sessionId))
    } catch {
      setError('بستن این نشست تأیید نشد. وضعیت را دوباره بارگیری کنید.')
    } finally { inFlight.current = false; setBusyId(null) }
  }

  return <div className="mx-auto max-w-[900px] px-4 py-8 lg:px-6">
    <Link to={ROUTES.account} className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-orange-700"><ArrowRight size={16} aria-hidden="true" /> بازگشت به حساب</Link>
    <div className="mt-4 flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700"><Shield aria-hidden="true" /></span><div><h1 className="text-2xl font-black text-slate-950">امنیت و نشست‌ها</h1><p className="mt-1 text-sm text-slate-500">نشست‌های فعال حساب شما را بررسی و در صورت نیاز ببندید.</p></div></div>
    <AccountNavigation />
    {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={() => { setLoading(true); setReload((value) => value + 1) }} className="mt-2 inline-flex items-center gap-2 font-bold underline"><RefreshCw size={14} aria-hidden="true" /> تلاش دوباره</button></div>}
    {loading && <p className="mt-6 text-sm text-slate-500" role="status">در حال دریافت نشست‌ها…</p>}
    {!loading && sessions.length === 0 && <p className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">نشست فعالی برای نمایش وجود ندارد.</p>}
    {!loading && sessions.length > 0 && <ul className="mt-6 space-y-3">{sessions.map((session) => <li key={session.sessionId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-orange-400"><Smartphone size={18} aria-hidden="true" /></span><div><p className="font-bold text-slate-950">{session.deviceName || 'دستگاه مشتری'} {session.current && <span className="mr-2 rounded-full bg-green-50 px-2 py-1 text-xs text-green-800">این دستگاه</span>}</p><p className="mt-1 text-xs text-slate-500">آخرین فعالیت: {session.lastUsedAt ? formatTimestamp(session.lastUsedAt) : 'ثبت نشده'} · انقضا: {formatTimestamp(session.expiresAt)}</p></div></div>
      <button type="button" disabled={busyId !== null} onClick={() => { void revoke(session) }} className="h-10 rounded-xl border border-red-300 px-4 text-sm font-bold text-red-700 disabled:opacity-50">{busyId === session.sessionId ? 'در حال بستن…' : 'بستن نشست'}</button>
    </li>)}</ul>}
  </div>
}
