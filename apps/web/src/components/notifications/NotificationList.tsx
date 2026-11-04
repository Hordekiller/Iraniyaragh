import { Link } from 'react-router-dom'
import type { InAppNotification } from '@iranyaragh/contracts'
import { formatTimestamp } from '../../lib/format'
import { safeNotificationHref } from '../../lib/notifications/api'

type Props = {
  items: InAppNotification[]
  onToggle: (item: InAppNotification) => void
  onNavigate: (item: InAppNotification) => void
}

export function NotificationList({ items, onToggle, onNavigate }: Props) {
  return (
    <ul className="divide-y divide-slate-100">
      {items.map(item => {
        const href = safeNotificationHref(item.href)
        const content = (
          <>
            <span className="flex items-center gap-2 text-sm font-black text-slate-900">
              {!item.read && <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-[#FF4D00]" />}
              {item.title}
              {!item.read && <span className="sr-only">(خوانده‌نشده)</span>}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-700">{item.body}</span>
            <time dateTime={item.createdAt} className="mt-1 block text-[11px] text-slate-500">{formatTimestamp(item.createdAt)}</time>
          </>
        )
        return (
          <li key={item.id} className={`flex items-start gap-2 px-4 py-3 ${item.read ? 'bg-white' : 'bg-orange-50/60'}`}>
            {href ? (
              <Link to={href} onClick={() => onNavigate(item)} className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">{content}</Link>
            ) : <div className="min-w-0 flex-1">{content}</div>}
            <button type="button" onClick={() => onToggle(item)} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-[#9A3412] hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]">
              {item.read ? 'علامت‌گذاری به‌عنوان نخوانده' : 'علامت‌گذاری به‌عنوان خوانده'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
