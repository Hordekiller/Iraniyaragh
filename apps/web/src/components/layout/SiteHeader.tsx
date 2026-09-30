import { AnimatePresence, motion } from 'framer-motion'
import { usePrefersReducedMotion } from '../../lib/reduced-motion'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Search, ShoppingBag, X } from 'lucide-react'
import { useCart } from '../../state/cart-context'
import { toPersianDigits } from '../../lib/format'
import { ROUTES } from '../../lib/routes'
import { AccountMenu } from '../auth/AccountMenu'
import { SearchSuggestions } from '../catalog/SearchSuggestions'
import { useSearchSuggestions } from '../catalog/use-search-suggestions'
import { SITE_NAME, SITE_TAGLINE } from '../../lib/site-config'

/** Active state is driven by the router, so each destination is a real page. */
const navClass = ({ isActive }: { isActive: boolean }) =>
  `transition ${isActive ? 'text-[#C2410C] font-bold' : 'hover:text-[#FF4D00]'}`

type SiteHeaderProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  showSearch: boolean
  onToggleSearch: () => void
  onOpenLogin: () => void
}

export function SiteHeader({ searchQuery, onSearchChange, showSearch, onToggleSearch, onOpenLogin }: SiteHeaderProps) {
  const navigate = useNavigate()
  const { state } = useCart()
  const itemCount = state.lines.reduce((sum, line) => sum + line.quantity, 0)
  // 2.3.3: the mobile menu's height animation is the large involuntary movement
  // the setting asks us to drop.
  const reducedMotion = usePrefersReducedMotion()

  const desktop = useSearchSuggestions(searchQuery, 'site-search-desktop')
  const mobile = useSearchSuggestions(searchQuery, 'site-search-mobile')

  function submitSearch() {
    if (!searchQuery.trim()) return
    navigate(`${ROUTES.search}?q=${encodeURIComponent(searchQuery.trim())}`)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>, suggestions: typeof desktop) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    // A highlighted suggestion wins over the raw term, so Enter goes to that
    // product instead of the full result list.
    if (suggestions.acceptActive()) return
    submitSearch()
  }

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-8 h-[64px] lg:h-[76px]">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-[#FF4D00] flex items-center justify-center text-white font-black text-xl leading-none rotate-3">
              <span className="-rotate-3">آ</span>
            </div>
            <div>
              <div className="font-black text-[17px] lg:text-[19px] leading-none text-[#0F172A] tracking-tight truncate">{SITE_NAME}</div>
              <div className="hidden sm:block text-[11px] text-slate-600 font-medium tracking-widest truncate">{SITE_TAGLINE}</div>
            </div>
            <span className="hidden lg:inline-flex mr-4 px-2.5 py-1 rounded-full bg-[#FF4D00]/10 text-[#C2410C] text-[11px] font-bold">فروشگاه تخصصی</span>
          </div>

          {/* Nav - Desktop */}
          <nav aria-label="ناوبری اصلی" className="hidden lg:flex items-center gap-7 mr-6 text-[14px] font-medium text-slate-700">
            <NavLink to={ROUTES.home} end className="text-[#C2410C] font-bold flex items-center gap-1">خانه <span className="w-1.5 h-1.5 rounded-full bg-[#C2410C]" /></NavLink>
            <NavLink to={ROUTES.categories} className={navClass}>دسته‌بندی‌ها</NavLink>
            <NavLink to={ROUTES.products} className={navClass}>همه کالاها</NavLink>
            <NavLink to={ROUTES.newest} className={navClass}>تازه‌های فروشگاه</NavLink>
            <NavLink to={ROUTES.services} className={navClass}>خدمات</NavLink>
          </nav>

          {/* Search - Desktop */}
          <div className="hidden lg:flex items-center flex-1 max-w-[420px] mr-auto">
            <div className="relative w-full">
              <input
                id="site-search-desktop"
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                onKeyDown={event => {
                  desktop.onKeyDown(event)
                  handleKeyDown(event, desktop)
                }}
                role="combobox"
                aria-expanded={desktop.listOpen}
                aria-controls={desktop.listOpen ? desktop.listboxId : undefined}
                aria-autocomplete="list"
                aria-activedescendant={desktop.activeDescendant}
                aria-label="جستجو در محصولات"
                placeholder="جستجو در ابزار و یراق‌آلات ... مثلا: دریل رونیکس"
                className="w-full h-11 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-full text-[13.5px] placeholder:text-slate-400 focus:outline-none focus:border-[#FF4D00]/40 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
              />
              <SearchSuggestions {...desktop} />
              <Search size={18} aria-hidden="true" className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              {searchQuery && (
                <button onClick={() => onSearchChange('')} aria-label="پاک کردن جستجو" className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><X size={14} /></button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="shrink-0 flex items-center gap-2 mr-auto lg:mr-0">
            <button onClick={onToggleSearch} aria-label="جستجو" className="lg:hidden w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center"><Search size={18} /></button>
            <Link
              to={ROUTES.cart}
              aria-label={`سبد خرید، ${toPersianDigits(itemCount)} کالا`}
              className="relative w-10 h-10 lg:w-11 lg:h-11 rounded-full border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center hover:bg-white hover:border-[#FF4D00]/30 hover:text-[#FF4D00] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
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

        {/* Mobile Search Expand */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              className="lg:hidden overflow-hidden"
            >
              <div className="pb-4">
                <div className="relative">
                  <input
                    id="site-search-mobile"
                    autoFocus
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    onKeyDown={event => {
                      mobile.onKeyDown(event)
                      handleKeyDown(event, mobile)
                    }}
                    role="combobox"
                    aria-expanded={mobile.listOpen}
                    aria-controls={mobile.listOpen ? mobile.listboxId : undefined}
                    aria-autocomplete="list"
                    aria-activedescendant={mobile.activeDescendant}
                    aria-label="جستجو در محصولات"
                    placeholder="جستجوی ابزار..."
                    className="w-full h-12 pr-11 pl-12 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-[#FF4D00]"
                  />
                  <SearchSuggestions {...mobile} />
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
    </header>
  )
}