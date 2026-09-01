import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../../state/auth-context'

type AccountMenuProps = {
  onOpenLogin: () => void
}

export function AccountMenu({ onOpenLogin }: AccountMenuProps) {
  const { state, controller } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const authenticated = state.phase === 'authenticated' && Boolean(state.principal)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (!menuOpen) return
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleLogout() {
    await controller.logout()
    setMenuOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => (authenticated ? setMenuOpen(o => !o) : onOpenLogin())}
        aria-label={authenticated ? 'حساب کاربری' : 'ورود به حساب کاربری'}
        className={`w-10 h-10 lg:w-11 lg:h-11 rounded-full border flex items-center justify-center transition ${
          authenticated
            ? 'bg-[#FF4D00] text-white border-[#FF4D00] hover:bg-[#e84600]'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-[#FF4D00]/30 hover:text-[#FF4D00]'
        }`}
      >
        <UserRound size={18} />
      </button>

      <AnimatePresence>
        {menuOpen && authenticated && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            className="absolute left-0 top-full mt-3 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50"
          >
            <div className="px-3 py-2 mb-1">
              <div className="text-[13px] font-black text-[#0F172A]">حساب کاربری</div>
              <div dir="ltr" className="text-[11px] text-slate-400 font-medium text-right mt-0.5">
                {state.principal?.userId}
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <button
              onClick={() => void handleLogout()}
              disabled={state.busy}
              className="mt-1 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-red-600 hover:bg-red-50 transition disabled:opacity-50"
            >
              <LogOut size={16} /> خروج از حساب
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
