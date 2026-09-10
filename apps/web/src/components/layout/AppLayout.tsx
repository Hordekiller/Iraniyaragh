import { useCallback, useState } from 'react'
import { Outlet, useSearchParams } from 'react-router-dom'
import { TopBar } from './TopBar'
import { SiteHeader } from './SiteHeader'
import { MobileBottomNav } from './MobileBottomNav'
import { SiteFooter } from './SiteFooter'
import { LoginDialog } from '../auth/LoginDialog'
import { SECTION_IDS } from '../../lib/site-config'

/**
 * Shared storefront shell. Owns the login dialog and header search state, and
 * renders the routed page content via <Outlet/>. Auth/Cart/Catalog providers
 * wrap this layout in App.
 */
export function AppLayout() {
  const [loginOpen, setLoginOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''

  const [resolvedUrlQuery, setResolvedUrlQuery] = useState(urlQuery)
  if (resolvedUrlQuery !== urlQuery) {
    setResolvedUrlQuery(urlQuery)
    setSearchQuery(urlQuery)
  }

  const openLogin = useCallback(() => setLoginOpen(true), [])
  const closeLogin = useCallback(() => setLoginOpen(false), [])

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
        onToggleSearch={() => setShowSearch(s => !s)}
        onOpenLogin={openLogin}
      />
      <main id={SECTION_IDS.mainContent}>
        <Outlet />
      </main>
      <SiteFooter />

      <MobileBottomNav onOpenSearch={() => setShowSearch(true)} />
      <LoginDialog open={loginOpen} onClose={closeLogin} />
    </>
  )
}
