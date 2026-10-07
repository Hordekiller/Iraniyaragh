import { useLocation, useNavigate } from 'react-router-dom'
import { Home, LayoutGrid, ShoppingBag, Search, User, PackageSearch } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { SECTION_IDS } from '../../lib/site-config'
import { useAuth } from '../../state/auth-context'

type MobileBottomNavProps = { onOpenSearch: () => void; onOpenLogin: () => void }

export function MobileBottomNav({ onOpenSearch, onOpenLogin }: MobileBottomNavProps) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { state: authState } = useAuth()

  function openCategories() {
    if (pathname === ROUTES.home) {
      document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    } else navigate(ROUTES.home, { state: { scrollToCategories: true } })
  }

  const items = [
    { label: 'خانه', icon: Home, active: pathname === ROUTES.home, action: () => navigate(ROUTES.home) },
    { label: 'جستجو', icon: Search, active: pathname === ROUTES.search, action: () => { onOpenSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }) } },
    { label: 'دسته‌بندی‌ها', short: 'دسته‌ها', icon: LayoutGrid, active: pathname.startsWith('/category/'), action: openCategories },
    { label: 'سبد خرید', icon: ShoppingBag, active: pathname === ROUTES.cart || pathname === ROUTES.checkout, action: () => navigate(ROUTES.cart) },
    { label: 'پیگیری سفارش‌ها', short: 'پیگیری', icon: PackageSearch, active: pathname === ROUTES.orders || pathname.startsWith(`${ROUTES.orders}/`), action: () => navigate(ROUTES.orders) },
    { label: 'حساب کاربری', short: 'پروفایل', icon: User, active: pathname === ROUTES.account || pathname.startsWith(`${ROUTES.account}/`), action: () => { if (authState.phase === 'authenticated') navigate(ROUTES.account); else onOpenLogin() } },
  ]

  return <>
    <nav aria-label="ناوبری پایین" className="pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:hidden">
      <div className="mx-auto max-w-[480px] px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto grid grid-cols-6 rounded-3xl border border-slate-200 bg-white px-1 py-2 shadow-xl">
          {items.map(({ label, short, icon: Icon, active, action }) => <button type="button" key={label} onClick={action} aria-label={label} aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 ${active ? 'bg-orange-50 text-orange-800' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
            <span>{short ?? label}</span>
          </button>)}
        </div>
      </div>
    </nav>
    <div aria-hidden="true" className="h-[calc(6rem+env(safe-area-inset-bottom))] lg:h-0" />
  </>
}
