import { useState } from 'react'
import { Home, LayoutGrid, MessageCircle, Search, User } from 'lucide-react'
import { useToast } from '../feedback/toast-context'

type MobileBottomNavProps = {
  onOpenSearch: () => void
}

export function MobileBottomNav({ onOpenSearch }: MobileBottomNavProps) {
  const [mobileNav, setMobileNav] = useState('home')
  const { show } = useToast()

  return (
    <>
      {/* Floating Detached Bottom Menu - Style 03 */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 pointer-events-none">
        {/* safe area background */}
        <div className="mx-auto max-w-[480px] px-4 pb-4 pt-2">
          <div className="pointer-events-auto bg-white rounded-[28px] shadow-[0_12px_40px_rgba(0,0,0,0.16),0_4px_12px_rgba(0,0,0,0.08)] border border-slate-100 flex items-center justify-between px-2 py-2">
            <button
              onClick={() => { setMobileNav('home'); document.getElementById('home')?.scrollIntoView({ behavior: 'smooth' }) }}
              className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl transition ${mobileNav === 'home' ? 'text-[#6842ff]' : 'text-slate-400'}`}
            >
              <Home size={22} className={mobileNav === 'home' ? 'fill-[#6842ff]/15' : ''} strokeWidth={mobileNav === 'home' ? 2.3 : 1.9} />
              <span className={`text-[11px] font-bold leading-none ${mobileNav === 'home' ? 'text-[#6842ff]' : 'text-slate-500'}`}>خانه</span>
              {mobileNav === 'home' && <span className="w-1 h-1 rounded-full bg-[#6842ff] mt-0.5" />}
            </button>

            <button onClick={() => { setMobileNav('search'); onOpenSearch(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav === 'search' ? 'text-[#6842ff]' : 'text-slate-400'}`}>
              <Search size={22} strokeWidth={mobileNav === 'search' ? 2.3 : 1.9} />
              <span className={`text-[11px] font-medium leading-none ${mobileNav === 'search' ? 'text-[#6842ff] font-bold' : 'text-slate-500'}`}>جستجو</span>
            </button>

            <button
              onClick={() => { setMobileNav('create'); document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }); show('دسته‌بندی‌ها') }}
              className="flex flex-col items-center gap-1 min-w-[64px] -mt-2"
            >
              <span className="w-[52px] h-[52px] rounded-full bg-[#6842ff] text-white flex items-center justify-center shadow-lg shadow-[#6842ff]/30 border-[3.5px] border-white">
                <LayoutGrid size={22} strokeWidth={2.2} />
              </span>
              <span className={`text-[11px] font-bold leading-none ${mobileNav === 'create' ? 'text-[#6842ff]' : 'text-slate-500'}`}>دسته‌ها</span>
            </button>

            <button onClick={() => { setMobileNav('inbox'); show('پشتیبانی: ۰۲۱-۸۸۸۸۸۸۸۸') }} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav === 'inbox' ? 'text-[#6842ff]' : 'text-slate-400'}`}>
              <MessageCircle size={22} strokeWidth={mobileNav === 'inbox' ? 2.3 : 1.9} />
              <span className={`text-[11px] font-medium leading-none ${mobileNav === 'inbox' ? 'text-[#6842ff] font-bold' : 'text-slate-500'}`}>پشتیبانی</span>
            </button>

            <button onClick={() => { setMobileNav('profile'); show('حساب کاربری') }} className={`flex flex-col items-center gap-1 min-w-[64px] py-1.5 transition ${mobileNav === 'profile' ? 'text-[#6842ff]' : 'text-slate-400'}`}>
              <User size={22} strokeWidth={mobileNav === 'profile' ? 2.3 : 1.9} />
              <span className={`text-[11px] font-medium leading-none ${mobileNav === 'profile' ? 'text-[#6842ff] font-bold' : 'text-slate-500'}`}>پروفایل</span>
            </button>
          </div>
          <div className="flex justify-center mt-2">
            <div className="w-32 h-1 rounded-full bg-white/80 shadow-sm" />
          </div>
        </div>
      </div>

      {/* Bottom padding for floating menu */}
      <div className="h-24 lg:h-0" />
    </>
  )
}