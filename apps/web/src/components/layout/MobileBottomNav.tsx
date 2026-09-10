import { useLocation, useNavigate } from 'react-router-dom'
import { Home, LayoutGrid, MessageCircle, Search, User } from 'lucide-react'
import { ROUTES } from '../../lib/routes'
import { PHONE_MAIN, SECTION_IDS } from '../../lib/site-config'
import { toLatinDigits } from '../../lib/format'

type MobileBottomNavProps = {
  onOpenSearch: () => void
}

export function MobileBottomNav({ onOpenSearch }: MobileBottomNavProps) {
  const navigate = useNavigate()
  const location = useLocation()

  function openCategories() {
    const scrollToCategories = () => {
      document.getElementById(SECTION_IDS.categories)?.scrollIntoView({ behavior: 'smooth' })
    }
    if (location.pathname === ROUTES.home) {
      scrollToCategories()
      return
    }
    navigate(ROUTES.home, { state: { scrollToCategories: true } })
  }

  return (
    <>
      {/* Floating Detached Bottom Menu - Style 03 */}
      <nav aria-label="ناوبری پایین" className="lg:hidden fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        {/* safe area background */}
        <div className="mx-auto max-w-[480px] px-4 pb-4 pt-2">
          <div className="pointer-events-auto bg-white rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center justify-between px-2 py-2">
            <button
              onClick={() => navigate(ROUTES.home)}
              aria-label="خانه"
              className="flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl transition text-[#6842ff]"
            >
              <Home size={22} className="fill-[#6842ff]/15" strokeWidth={2.3} />
              <span className="text-[11px] font-bold leading-none text-[#6842ff]">خانه</span>
              <span className="w-1 h-1 rounded-full bg-[#6842ff] mt-0.5" />
            </button>

            <button
              onClick={() => { onOpenSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
              aria-label="جستجو"
              className="flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition text-slate-500"
            >
              <Search size={22} strokeWidth={1.9} />
              <span className="text-[11px] font-medium leading-none text-slate-500">جستجو</span>
            </button>

            <button
              onClick={openCategories}
              aria-label="دسته‌بندی‌ها"
              className="flex flex-col items-center gap-1 min-w-[64px] -mt-2"
            >
              <span className="w-[52px] h-[52px] rounded-full bg-[#6842ff] text-white flex items-center justify-center shadow-lg shadow-[#6842ff]/30 border-[3.5px] border-white">
                <LayoutGrid size={22} strokeWidth={2.2} />
              </span>
              <span className="text-[11px] font-bold leading-none text-slate-500">دسته‌ها</span>
            </button>

            <a
              href={`tel:${toLatinDigits(PHONE_MAIN).replace(/[^0-9]/g, '')}`}
              aria-label="پشتیبانی"
              className="flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition text-slate-500"
            >
              <MessageCircle size={22} strokeWidth={1.9} />
              <span className="text-[11px] font-medium leading-none text-slate-500">پشتیبانی</span>
            </a>

            <button
              onClick={() => navigate(ROUTES.account)}
              aria-label="حساب کاربری"
              className="flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition text-slate-500"
            >
              <User size={22} strokeWidth={1.9} />
              <span className="text-[11px] font-medium leading-none text-slate-500">پروفایل</span>
            </button>
          </div>
          <div className="flex justify-center mt-2">
            <div className="w-32 h-1 rounded-full bg-white/80 shadow-sm" />
          </div>
        </div>
      </nav>

      {/* Bottom padding for floating menu */}
      <div className="h-24 lg:h-0" />
    </>
  )
}
