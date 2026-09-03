import { AnimatePresence, motion } from 'framer-motion'
import { Menu, Phone, Search, X } from 'lucide-react'
import { useToast } from '../feedback/toast-context'
import { AccountMenu } from '../auth/AccountMenu'

type SiteHeaderProps = {
  searchQuery: string
  onSearchChange: (value: string) => void
  showSearch: boolean
  onToggleSearch: () => void
  onOpenLogin: () => void
}

export function SiteHeader({ searchQuery, onSearchChange, showSearch, onToggleSearch, onOpenLogin }: SiteHeaderProps) {
  const { show } = useToast()

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6">
        <div className="flex items-center gap-4 lg:gap-8 h-[64px] lg:h-[76px]">
          {/* Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-xl bg-[#FF4D00] flex items-center justify-center text-white font-black text-xl leading-none rotate-3">
              <span className="-rotate-3">آ</span>
            </div>
            <div>
              <div className="font-black text-[17px] lg:text-[19px] leading-none text-[#0F172A] tracking-tight">ایران یراق</div>
              <div className="text-[11px] text-slate-500 font-medium tracking-widest">ARAD TOOLS • از ۱۳۸۵</div>
            </div>
            <span className="hidden lg:inline-flex mr-4 px-2.5 py-1 rounded-full bg-[#FF4D00]/10 text-[#FF4D00] text-[11px] font-bold">فروشگاه تخصصی</span>
          </div>

          {/* Nav - Desktop */}
          <nav className="hidden lg:flex items-center gap-7 mr-6 text-[14px] font-medium text-slate-700">
            <a href="#home" className="text-[#FF4D00] font-bold flex items-center gap-1">خانه <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D00]" /></a>
            <a href="#categories" className="hover:text-[#FF4D00] transition">دسته‌بندی‌ها</a>
            <a href="#popular" className="hover:text-[#FF4D00] transition">محبوب‌ها</a>
            <a href="#bestseller" className="hover:text-[#FF4D00] transition">پرفروش‌ها</a>
            <a href="#blog" className="hover:text-[#FF4D00] transition flex items-center gap-1">مجله آموزشی <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-white text-[10px] font-bold">جدید</span></a>
            <a href="#services" className="hover:text-[#FF4D00] transition">خدمات</a>
          </nav>

          {/* Search - Desktop */}
          <div className="hidden lg:flex items-center flex-1 max-w-[420px] mr-auto">
            <div className="relative w-full">
              <input
                value={searchQuery}
                onChange={e => onSearchChange(e.target.value)}
                placeholder="جستجو در ۲۵۰۰+ ابزار ... مثلا : دریل رونیکس"
                className="w-full h-11 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-full text-[13.5px] placeholder:text-slate-400 focus:outline-none focus:border-[#FF4D00]/40 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
              />
              <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              {searchQuery && (
                <button onClick={() => onSearchChange('')} aria-label="پاک کردن جستجو" className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center"><X size={14} /></button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mr-auto lg:mr-0">
            <button onClick={onToggleSearch} className="lg:hidden w-10 h-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center"><Search size={18} /></button>
            <button onClick={() => show('تماس: ۰۲۱-۸۸۸۸۸۸۸۸')} className="hidden lg:flex items-center gap-2 h-11 px-5 rounded-full bg-[#0F172A] text-white text-[13px] font-bold hover:bg-black transition">
              <Phone size={16} /> مشاوره خرید
            </button>
            <AccountMenu onOpenLogin={onOpenLogin} />
            <button className="lg:hidden w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center" onClick={() => show('منو')}>
              <Menu size={18} />
            </button>
          </div>
        </div>

        {/* Mobile Search Expand */}
        <AnimatePresence>
          {showSearch && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="lg:hidden overflow-hidden">
              <div className="pb-4">
                <div className="relative">
                  <input autoFocus value={searchQuery} onChange={e => onSearchChange(e.target.value)} placeholder="جستجوی ابزار..." className="w-full h-12 pr-11 pl-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-[#FF4D00]" />
                  <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  )
}