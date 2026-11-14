import { NavLink } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'

const groups = [
  {
    label: 'سفارش و خرید',
    links: [
      [ROUTES.orders, 'سفارش‌های من'],
      [ROUTES.myCustomDoors, 'سفارش‌های ساخت درب من'],
      [ROUTES.invoices, 'فاکتورهای من'],
      [ROUTES.cart, 'سبد خرید'],
    ],
  },
  {
    label: 'اطلاعات و امنیت',
    links: [
      [ROUTES.account, 'پروفایل'],
      [ROUTES.addresses, 'دفتر نشانی‌ها'],
      [ROUTES.credit, 'صورتحساب و بدهی'],
      [ROUTES.notifications, 'اعلان‌ها'],
      [ROUTES.sessions, 'امنیت و نشست‌ها'],
    ],
  },
] as const

export function AccountNavigation() {
  return (
    <nav aria-label="بخش‌های حساب کاربری" className="my-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
        {groups.map(group => (
          <div key={group.label}>
            <p className="mb-3 text-xs font-black text-slate-500">{group.label}</p>
            <div className="flex flex-wrap gap-2">
              {group.links.map(([to, title]) => (
                <NavLink key={to} to={to} end className={({ isActive }) => `inline-flex min-h-11 items-center rounded-xl border px-3 py-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 ${isActive ? 'border-orange-600 bg-orange-50 text-orange-900' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-400 hover:text-orange-800'}`}>
                  {title}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )
}

export function SessionRestoring() {
  return <p role="status" className="px-4 py-16 text-center text-slate-600">در حال بازیابی نشست شما…</p>
}
