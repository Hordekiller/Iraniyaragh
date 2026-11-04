import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { InAppNotification } from '@iranyaragh/contracts'
import { AccountNavigation, SessionRestoring } from '../components/account/AccountNavigation'
import { NotificationList } from '../components/notifications/NotificationList'
import { createNotificationsApi, NOTIFICATIONS_AVAILABLE } from '../lib/notifications/api'
import { toPersianDigits } from '../lib/format'
import { useAuth } from '../state/auth-context'

export function NotificationsPage() {
  const auth = useAuth()
  const api = useMemo(() => createNotificationsApi(auth.request), [auth.request])
  const authenticated = auth.state.phase === 'authenticated'
  const [items, setItems] = useState<InAppNotification[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState(false)

  const load = useCallback((after?: string) => {
    api.list(after).then(page => {
      setItems(current => (after && current ? [...current, ...page.items] : page.items))
      setCursor(page.nextCursor); setUnread(page.unreadCount)
      setError(false)
    }, () => setError(true))
  }, [api])
  useEffect(() => { if (authenticated && NOTIFICATIONS_AVAILABLE) load() }, [authenticated, auth.identityVersion, load])

  if (!authenticated && (!auth.restored || auth.state.restoring)) return <SessionRestoring />
  if (!authenticated) return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-xl font-black text-slate-900">برای مشاهدهٔ اعلان‌ها وارد شوید</h1>
      <button type="button" onClick={auth.open} className="mt-4 rounded-xl bg-[#C2410C] px-5 py-3 font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2">ورود</button>
    </main>
  )

  if (!NOTIFICATIONS_AVAILABLE) return <main className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-700">اعلان‌ها در نسخهٔ نمایشی در دسترس نیستند.</main>

  const toggle = (item: InAppNotification) => api.setRead(item.id, !item.read).then(next => {
    setItems(current => current?.map(row => row.id === next.id ? next : row) ?? current)
    setUnread(count => Math.max(0, count + (next.read ? -1 : 1)))
  }, () => setError(true))
  const markAll = () => api.markAllRead().then(count => { setUnread(count); setItems(current => current?.map(row => ({ ...row, read: true })) ?? current) }, () => setError(true))

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 lg:px-6">
      <AccountNavigation />
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black text-slate-900">اعلان‌ها{unread > 0 && <span className="mr-2 text-sm font-bold text-[#C2410C]">{toPersianDigits(unread)} خوانده‌نشده</span>}</h1>
        <button type="button" onClick={markAll} disabled={unread === 0} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-800 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">همه را خوانده‌شده کن</button>
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {error && <p role="alert" className="p-4 text-sm text-red-800">اعلان‌ها دریافت نشدند. <button type="button" onClick={() => load()} className="font-bold underline">تلاش دوباره</button></p>}
        {!error && items === null && <p role="status" className="p-6 text-sm text-slate-600">در حال دریافت…</p>}
        {!error && items?.length === 0 && <p className="p-8 text-center text-sm text-slate-600">هنوز اعلانی ندارید. تغییر وضعیت سفارش و پرداخت اینجا نمایش داده می‌شود.</p>}
        {items && items.length > 0 && <NotificationList items={items} onToggle={item => void toggle(item)} onNavigate={item => { if (!item.read) void toggle(item) }} />}
      </div>
      {cursor && <button type="button" onClick={() => load(cursor)} className="mt-4 w-full rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">نمایش قدیمی‌تر</button>}
      <p className="mt-6 text-center text-xs text-slate-500"><Link to="/orders" className="underline">پیگیری سفارش‌ها</Link></p>
    </main>
  )
}
