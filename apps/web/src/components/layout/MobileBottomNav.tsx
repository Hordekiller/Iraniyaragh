import { NavLink, useNavigate } from 'react-router-dom'
import { Home, LayoutGrid, Package, Search, User } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useAuth } from '../../state/auth-context'
import { scrollBehavior } from '../../lib/reduced-motion'

type MobileBottomNavProps = {
  onOpenSearch: () => void
  onOpenLogin: () => void
}

/**
 * Floating mobile navigation.
 *
 * Every entry is a real route or a real action: the categories item used to
 * scroll to a home-page anchor, which left the customer on the same page with
 * no page of their own, and support used to be a `tel:` link to a number this
 * storefront does not own. Both are gone.
 *
 * The active state is derived from the router for the icon, the label and the
 * underline, so a customer can always tell which page they are on. The bar also
 * reserves the iOS home-indicator inset and leaves a spacer so the last row of
 * page content is never hidden behind it.
 *
 * The cart is intentionally absent: the header already carries the cart on
 * every viewport, and two controls for one destination is a trap, not a
 * shortcut.
 */
export function MobileBottomNav({ onOpenSearch, onOpenLogin }: MobileBottomNavProps) {
  const navigate = useNavigate()
  const { state: authState } = useAuth()
  const signedIn = authState.phase === 'authenticated'

  function itemClass(active: boolean) {
    return [
      'flex flex-col items-center justify-center gap-1 min-w-0 flex-1 h-14 rounded-2xl transition',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6842ff] focus-visible:ring-offset-2',
      active ? 'bg-[#6842ff]/10 text-[#6842ff]' : 'text-slate-600',
    ].join(' ')
  }

  /** The small bar that marks the destination the customer is currently on. */
  function ActiveMark() {
    return (
      <span
        aria-hidden="true"
        className="absolute bottom-1 h-1 w-6 rounded-full bg-[#6842ff]"
      />
    )
  }

  return (
    <>
      <nav
        aria-label="ناوبری پایین"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 pointer-events-none"
      >
        <div className="mx-auto max-w-[520px] px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto bg-white rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center gap-1 px-1.5 py-1.5">
            <NavLink
              to={ROUTES.home}
              aria-label="خانه"
              className={({ isActive }) => `${itemClass(isActive)} relative`}
            >
              {({ isActive }) => (
                <>
                  <Home
                    size={21}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className={isActive ? 'fill-[#6842ff]/20' : 'fill-transparent'}
                  />
                  <span className="text-[11px] font-bold leading-none">خانه</span>
                  {isActive && <ActiveMark />}
                </>
              )}
            </NavLink>

            <button
              type="button"
              onClick={() => {
                onOpenSearch()
                window.scrollTo({ top: 0, behavior: scrollBehavior() })
              }}
              aria-label="جستجو"
              className={`${itemClass(false)} relative`}
            >
              <Search size={21} strokeWidth={2} aria-hidden="true" />
              <span className="text-[11px] font-bold leading-none">جستجو</span>
            </button>

            <NavLink
              to={ROUTES.categories}
              aria-label="دسته‌بندی‌ها"
              className={({ isActive }) => `${itemClass(isActive)} relative`}
            >
              {({ isActive }) => (
                <>
                  <LayoutGrid
                    size={21}
                    strokeWidth={2.2}
                    aria-hidden="true"
                    className={isActive ? 'fill-[#6842ff]/20' : 'fill-transparent'}
                  />
                  <span className="text-[11px] font-bold leading-none">دسته‌ها</span>
                  {isActive && <ActiveMark />}
                </>
              )}
            </NavLink>

            <NavLink
              to={ROUTES.orders}
              aria-label="پیگیری سفارش"
              className={({ isActive }) => `${itemClass(isActive)} relative`}
            >
              {({ isActive }) => (
                <>
                  <Package size={21} strokeWidth={2} aria-hidden="true" />
                  <span className="text-[11px] font-bold leading-none">پیگیری</span>
                  {isActive && <ActiveMark />}
                </>
              )}
            </NavLink>

            <button
              type="button"
              onClick={() => {
                if (signedIn) navigate(ROUTES.account)
                else onOpenLogin()
              }}
              aria-label="حساب کاربری"
              className={`${itemClass(false)} relative`}
            >
              <User size={21} strokeWidth={2} aria-hidden="true" />
              <span className="text-[11px] font-bold leading-none">
                {signedIn ? 'حساب' : 'ورود'}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Reserve the bar's height so the last row of content is never covered. */}
      <div className="h-28 lg:h-0" aria-hidden="true" />
    </>
  )
}
