import { useCallback, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Menu, Phone, Search, ShoppingBag, X } from 'lucide-react'
import { useCart } from '../../state/cart-context'
import { toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { AccountMenu } from '../auth/AccountMenu'
import { HAS_SITE_PHONE, SITE_PHONE } from '../../lib/site-config'
import { StoreBrandLogo } from '../brand/StoreBrandLogo'
import { SiteNavigationDrawer } from './SiteNavigationDrawer'

type SiteHeaderProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  showSearch: boolean
  onToggleSearch: () => void
  onOpenLogin: () => void
}

export function SiteHeader({ searchQuery, onSearchChange, showSearch, onToggleSearch, onOpenLogin }: SiteHeaderProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const locationIdentity = `${location.pathname}${location.search}${location.hash}`
  const reduceMotion = useReducedMotion()
  const [menu, setMenu] = useState({ locationKey: locationIdentity, open: false })
  if (menu.locationKey !== locationIdentity) setMenu({ locationKey: locationIdentity, open: false })
  const menuOpen = menu.locationKey === locationIdentity && menu.open
  const closeMenu = useCallback(() => setMenu(current => ({ ...current, open: false })), [])
  const openMenu = () => setMenu({ locationKey: locationIdentity, open: true })
  const { state } = useCart()
  const itemCount = state.cart.lines.reduce((sum, line) => sum + line.quantity, 0)

  function submitSearch() {
    if (!searchQuery.trim()) return
    navigate(`${ROUTES.search}?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitSearch()
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 h-[72px] lg:h-[88px]">
          <button type="button" onClick={openMenu} aria-label="باز کردن منوی فروشگاه" aria-expanded={menuOpen} aria-controls="store-navigation" aria-haspopup="dialog" className="group flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-800 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800">
            <Menu size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          {/* Logo */}
          <Link to={ROUTES.home} aria-label="ایرانی یراق؛ صفحهٔ اصلی" className="flex shrink-0 items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C2410C]">
            <StoreBrandLogo />
          </Link>

          {/* Search - Desktop */}
          <div className="hidden min-w-0 lg:flex items-center flex-1 max-w-[480px] mr-auto">
            <div className="relative w-full">
              <input
                id="site-search-desktop"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="جستجو در محصولات"
                placeholder="جستجو در کالاهای فروشگاه..."
                className="w-full h-11 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-full text-[13.5px] placeholder:text-slate-400 focus:outline-none focus:border-[#FF4D00]/40 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
              />
              <Search size={18} aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              {searchQuery && (
                <button onClick={() => onSearchChange('')} aria-label="پاک کردن جستجو" className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><X size={14} /></button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2 mr-auto lg:mr-0">
            <button onClick={onToggleSearch} aria-label="جستجو" aria-expanded={showSearch} aria-controls="mobile-header-search" className="lg:hidden w-11 h-11 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center"><Search size={18} aria-hidden="true" /></button>
            {HAS_SITE_PHONE && (
              <a href={`tel:${SITE_PHONE}`} className="hidden lg:flex items-center gap-2 h-11 px-5 rounded-full bg-[#0F172A] text-white text-[13px] font-bold hover:bg-black transition">
                <Phone size={16} aria-hidden="true" /> تماس با فروشگاه
              </a>
            )}
            <Link
              to={ROUTES.cart}
              aria-label={`سبد خرید، ${toPersianDigits(itemCount)} کالا`}
              className="relative w-11 h-11 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-white hover:border-[#FF4D00]/30 hover:text-[#FF4D00] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
            >
              <ShoppingBag size={18} aria-hidden="true" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#FF4D00] text-white text-[10px] font-black flex items-center justify-center">
                  {toPersianDigits(itemCount)}
                </span>
              )}
            </Link>
            <AccountMenu onOpenLogin={onOpenLogin} />
          </div>
        </div>

        <nav aria-label="ناوبری اصلی" className="hidden lg:flex min-h-12 items-center gap-7 border-t border-slate-100 text-[13px] font-medium text-slate-600">
          <button type="button" onClick={openMenu} aria-expanded={menuOpen} aria-controls="store-navigation" aria-haspopup="dialog" className="flex min-h-12 items-center gap-2 border-l border-slate-200 pl-6 font-bold text-orange-800 transition-colors hover:text-orange-950"><Menu size={18} aria-hidden="true" /> دسته‌بندی کالاها <ChevronDown size={14} aria-hidden="true" /></button>
          {[{ to: ROUTES.home, label: 'خانه' }, { to: ROUTES.search, label: 'همه کالاها' }, { to: ROUTES.bestsellers, label: 'پرفروش‌ها' }, { to: ROUTES.orders, label: 'پیگیری سفارش' }].map(item => <NavLink key={item.to} to={item.to} end className={({ isActive }) => `inline-flex min-h-12 items-center border-b-2 transition-colors hover:text-orange-800 ${isActive ? 'border-orange-700 font-bold text-orange-800' : 'border-transparent'}`}>{item.label}</NavLink>)}
          <span className="mr-auto text-[11px] text-slate-500">فروشگاه تخصصی ابزار و یراق‌آلات</span>
        </nav>

        {/* Mobile Search Expand */}
        <AnimatePresence>
          {showSearch && (
            <motion.div id="mobile-header-search" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="lg:hidden overflow-hidden">
              <div className="pb-4">
                <div className="relative">
                  <input id="site-search-mobile" autoFocus value={searchQuery} onChange={e => onSearchChange(e.target.value)} onKeyDown={handleKeyDown} aria-label="جستجو در محصولات" placeholder="جستجوی ابزار..." className="w-full h-12 pr-11 pl-12 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-[#FF4D00]" />
                  <Search size={18} aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <button
                    onClick={() => { onSearchChange(''); onToggleSearch() }}
                    aria-label="بستن جستجو"
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-200/70 text-slate-500 flex items-center justify-center hover:bg-slate-900 hover:text-white transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {menuOpen && <SiteNavigationDrawer onClose={closeMenu} />}
    </header>
  )
}
