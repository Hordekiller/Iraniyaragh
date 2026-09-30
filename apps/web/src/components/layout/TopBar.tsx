import { Link } from 'react-router-dom'
import { SITE_NAME, SITE_TAGLINE } from '../../lib/site-config'
import { ROUTES } from '../../lib/routes'

export function TopBar() {
  return (
    <div className="hidden lg:block bg-[#070b18] text-white/80 text-[12.5px] border-b border-white/5">
      <div className="max-w-[1280px] mx-auto px-6 py-2.5 flex items-center justify-between">
        <span>{SITE_NAME} — {SITE_TAGLINE}</span>
        <div className="flex items-center gap-5">
          <Link to={ROUTES.orders} className="flex items-center gap-2 hover:text-white transition">پیگیری سفارش</Link>
          <span className="w-px h-3 bg-white/20" />
          <Link to={ROUTES.account} className="hover:text-white transition">حساب کاربری</Link>
        </div>
      </div>
    </div>
  )
}
