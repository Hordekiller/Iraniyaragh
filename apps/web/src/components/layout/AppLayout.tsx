import { useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { TopBar } from './TopBar'
import { SiteHeader } from './SiteHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { SiteFooter } from './SiteFooter'
import { LoginDialog } from '../auth/LoginDialog'
import { SECTION_IDS } from '../../lib/site-config'
import { useAuth } from '../../state/auth-context'

/**
 * Shared storefront shell. Owns the login dialog and header search state, and
 * renders the routed page content via <Outlet/>. Auth/Cart/Catalog providers
 * wrap this layout in App.
 */
export function AppLayout() {
  const auth = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const urlQuery = searchParams.get('q') ?? ''

  const [resolvedUrlQuery, setResolvedUrlQuery] = useState(urlQuery)
  if (resolvedUrlQuery !== urlQuery) {
    setResolvedUrlQuery(urlQuery)
    setSearchQuery(urlQuery)
  }

  const loginOpen =
    auth.state.phase === 'mobile' ||
    auth.state.phase === 'code' ||
    auth.state.phase === 'session-expired'

  return (
    <>
      <a
        href={`#${SECTION_IDS.mainContent}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[100] focus:rounded-full focus:bg-slate-900 focus:px-5 focus:py-2.5 focus:text-white focus:font-bold"
      >
        پرش به محتوای اصلی
      </a>
      <TopBar />
      <SiteHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        showSearch={showSearch}
        onToggleSearch={() => setShowSearch((s) => !s)}
        onOpenLogin={auth.open}
      />
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {routeAnnouncement(location.pathname)}
      </div>
      <main id={SECTION_IDS.mainContent} tabIndex={-1}>
        <Outlet />
      </main>
      <SiteFooter />

      <MobileBottomNav
        onOpenSearch={() => setShowSearch(true)}
        onOpenLogin={auth.open}
      />
      <LoginDialog open={loginOpen} onClose={auth.close} />
    </>
  )
}

function routeAnnouncement(pathname: string): string {
  if (pathname === '/') return 'صفحه خانه'
  if (pathname === '/cart') return 'صفحه سبد خرید'
  if (pathname === '/checkout') return 'صفحه تکمیل سفارش'
  if (pathname === '/orders') return 'صفحه سفارش‌های من'
  if (pathname.startsWith('/orders/')) return 'صفحه جزئیات سفارش'
  if (pathname.startsWith('/payment/')) return 'صفحه وضعیت پرداخت'
  if (pathname === '/payment-return') return 'صفحه نتیجه پرداخت'
  if (pathname.startsWith('/product/')) return 'صفحه محصول'
  return 'صفحه جدید'
}
