import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, LayoutGrid, ShoppingBag, Search, User, PackageSearch } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { useAuth } from '../../state/auth-context'

type MobileBottomNavProps = { onOpenSearch: () => void; onOpenLogin: () => void; embedded?: boolean }

export function MobileBottomNav({ onOpenSearch, onOpenLogin, embedded = false }: MobileBottomNavProps) {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const node = navRef.current
    if (!node || embedded) return
    const measure = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (height > 0) document.documentElement.style.setProperty('--mobile-nav-height', `${height}px`)
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(node)
    return () => { observer?.disconnect(); document.documentElement.style.removeProperty('--mobile-nav-height') }
  }, [embedded, pathname])
  const navigate = useNavigate()
  const { state: authState } = useAuth()

  // Product pages provide their own persistent purchase controls.
  if (!embedded && (pathname.startsWith('/products/') || pathname.startsWith('/product/'))) {
    // Room for the dock plus the page-helper button above it, so the last content can scroll clear of both.
    return <div aria-hidden="true" data-testid="product-dock-spacer" className="h-[calc(var(--product-dock-height,14rem)+3.75rem)] lg:h-0" />
  }

  const items = [
    { label: 'خانه', icon: Home, active: pathname === ROUTES.home, action: () => navigate(ROUTES.home) },
    { label: 'جستجو', icon: Search, active: pathname === ROUTES.search, action: () => { onOpenSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }) } },
    { label: 'دسته‌بندی‌ها', short: 'دسته‌ها', icon: LayoutGrid, active: pathname === ROUTES.categories || pathname.startsWith('/categories/'), action: () => navigate(ROUTES.categories) },
    { label: 'سبد خرید', icon: ShoppingBag, active: pathname === ROUTES.cart || pathname === ROUTES.checkout, action: () => navigate(ROUTES.cart) },
    { label: 'پیگیری سفارش‌ها', short: 'پیگیری', icon: PackageSearch, active: pathname === ROUTES.orders || pathname.startsWith(`${ROUTES.orders}/`), action: () => navigate(ROUTES.orders) },
    { label: 'حساب کاربری', short: 'پروفایل', icon: User, active: pathname === ROUTES.account || pathname.startsWith(`${ROUTES.account}/`), action: () => { if (authState.phase === 'authenticated') navigate(ROUTES.account); else onOpenLogin() } },
  ]

  return <>
    <nav ref={navRef} aria-label="ناوبری پایین" className={embedded ? 'w-full lg:hidden' : 'pointer-events-none fixed inset-x-0 bottom-0 z-50 lg:hidden'}>
      <div className={embedded ? 'mx-auto w-full max-w-[480px]' : 'mx-auto max-w-[480px] px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]'}>
        <div className={`pointer-events-auto grid grid-cols-6 bg-white px-1 py-2 ${embedded ? 'rounded-2xl' : 'rounded-3xl border border-slate-200 shadow-xl'}`}>
          {items.map(({ label, short, icon: Icon, active, action }) => <button type="button" key={label} onClick={action} aria-label={short && !label.includes(short) ? `${short} (${label})` : label} aria-current={active ? 'page' : undefined}
            className={`flex min-h-12 min-w-11 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 text-[10px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 ${active ? 'bg-orange-50 text-orange-800' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon size={21} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
            <span>{short ?? label}</span>
          </button>)}
        </div>
      </div>
    </nav>
    {/* Bottom nav plus the 48px page-helper button above it (and its gap). */}
    {!embedded && <div aria-hidden="true" className="h-[calc(9.75rem+env(safe-area-inset-bottom))] lg:h-0" />}
  </>
}
