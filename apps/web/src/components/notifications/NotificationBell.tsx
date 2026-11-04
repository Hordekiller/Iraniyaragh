import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import type { InAppNotification } from '@iranyaragh/contracts'
import { useAuth } from '../../state/auth-context'
import { toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { createNotificationsApi } from '../../lib/notifications/api'
import { NotificationList } from './NotificationList'

const POLL_MS = 60_000

/** Customer bell. Renders nothing for guests; one count request on mount/focus/interval, list only when opened. */
export function NotificationBell() {
  const auth = useAuth()
  // Keyed by identity so a logout/login never shows another customer's state.
  return auth.state.phase === 'authenticated' ? <AuthenticatedBell key={auth.identityVersion} /> : null
}

function AuthenticatedBell() {
  const auth = useAuth()
  const api = useMemo(() => createNotificationsApi(auth.request), [auth.request])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<InAppNotification[] | null>(null)
  const [error, setError] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const refreshCount = useCallback(() => { api.unreadCount().then(setUnread, () => undefined) }, [api])
  const loadList = useCallback(() => {
    api.list().then(page => { setError(false); setItems(page.items); setUnread(page.unreadCount) }, () => setError(true))
  }, [api])

  useEffect(() => {
    refreshCount()
    const tick = () => { if (document.visibilityState === 'visible') refreshCount() }
    const timer = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [refreshCount])

  useEffect(() => {
    if (!open) return
    loadList()
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    const onPointer = (event: MouseEvent) => { if (root.current && !root.current.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onPointer) }
  }, [open, loadList])


  const patch = (next: InAppNotification) => setItems(current => current?.map(item => item.id === next.id ? next : item) ?? current)
  const toggle = (item: InAppNotification) => { api.setRead(item.id, !item.read).then(next => { patch(next); refreshCount() }, () => setError(true)) }
  const navigate = (item: InAppNotification) => { setOpen(false); if (!item.read) api.setRead(item.id, true).then(refreshCount, () => undefined) }
  const markAll = () => { api.markAllRead().then(count => { setUnread(count); setItems(current => current?.map(item => ({ ...item, read: true })) ?? current) }, () => setError(true)) }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label={unread > 0 ? `اعلان‌ها، ${toPersianDigits(unread)} خوانده‌نشده` : 'اعلان‌ها'}
        aria-expanded={open}
        aria-controls="customer-notifications-panel"
        className="relative flex size-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-[#FF4D00]/30 hover:bg-white hover:text-[#FF4D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span aria-hidden="true" className="absolute -top-1 -left-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#FF4D00] px-1 text-[10px] font-black text-white">{unread > 99 ? '+۹۹' : toPersianDigits(unread)}</span>}
      </button>
      {open && (
        <div id="customer-notifications-panel" role="region" aria-label="اعلان‌ها" className="fixed inset-x-3 top-[76px] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-black text-slate-900">اعلان‌ها</h2>
            <button type="button" onClick={markAll} disabled={unread === 0} className="rounded-lg px-2 py-1 text-xs font-bold text-[#9A3412] hover:bg-orange-50 disabled:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">همه را خوانده‌شده کن</button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto" aria-live="polite">
            {error && <p role="alert" className="p-4 text-sm text-red-800">اعلان‌ها دریافت نشدند. <button type="button" onClick={loadList} className="font-bold underline">تلاش دوباره</button></p>}
            {!error && items === null && <p role="status" className="p-4 text-sm text-slate-600">در حال دریافت…</p>}
            {!error && items?.length === 0 && <p className="p-6 text-center text-sm text-slate-600">اعلانی وجود ندارد.</p>}
            {!error && items && items.length > 0 && <NotificationList items={items} onToggle={toggle} onNavigate={navigate} />}
          </div>
          <Link to={ROUTES.notifications} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-3 text-center text-xs font-bold text-[#9A3412] hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF4D00]">مشاهدهٔ همهٔ اعلان‌ها</Link>
        </div>
      )}
    </div>
  )
}
