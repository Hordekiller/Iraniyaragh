import { NavLink } from 'react-router-dom'
import { ROUTES } from '../../lib/routes'

export function AccountNavigation() {
  return <nav aria-label="بخش‌های حساب کاربری" className="my-6 flex flex-wrap gap-2">
    {[
      [ROUTES.account, 'پروفایل'], [ROUTES.orders, 'سفارش‌های من'],
      [ROUTES.addresses, 'دفتر نشانی‌ها'], [ROUTES.sessions, 'امنیت و نشست‌ها'],
      [ROUTES.cart, 'سبد خرید'],
    ].map(([to, title]) => <NavLink key={to} to={to} end className={({ isActive }) => `rounded-xl border px-4 py-3 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 ${isActive ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-400'}`}>{title}</NavLink>)}
  </nav>
}

export function SessionRestoring() {
  return <p role="status" className="px-4 py-16 text-center text-slate-600">در حال بازیابی نشست شما…</p>
}
