import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../../state/auth-context'

type AccountMenuProps = {
  onOpenLogin: () => void
}

export function AccountMenu({ onOpenLogin }: AccountMenuProps) {
  const { state, controller } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const logoutRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()

  const authenticated = state.phase === 'authenticated' && Boolean(state.principal)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Tab') {
        setMenuOpen(false)
        return
      }
      if (e.key !== 'Escape') return
      e.preventDefault()
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
    if (!menuOpen) return
    const focusFrame = requestAnimationFrame(() => logoutRef.current?.focus())
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!authenticated || !['ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    setMenuOpen(true)
  }

  async function handleLogout() {
    await controller.logout()
    setMenuOpen(false)
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        onClick={() => (authenticated ? setMenuOpen(o => !o) : onOpenLogin())}
        onKeyDown={handleTriggerKeyDown}
        aria-label={authenticated ? 'حساب کاربری' : 'ورود به حساب کاربری'}
        aria-expanded={authenticated ? menuOpen : undefined}
        aria-haspopup={authenticated ? 'menu' : undefined}
        aria-controls={authenticated ? 'account-menu' : undefined}
        className={`w-10 h-10 lg:w-11 lg:h-11 rounded-full border flex items-center justify-center transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 ${
          authenticated
            ? 'bg-[#C2410C] text-white border-[#C2410C] hover:bg-[#A83509]'
            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white hover:border-[#FF4D00]/30 hover:text-[#FF4D00]'
        }`}
      >
        <UserRound size={18} />
      </button>

      <AnimatePresence initial={!reduceMotion}>
        {menuOpen && authenticated && (
          <motion.div
            id="account-menu"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.14 }}
            className="absolute left-0 top-full mt-3 w-60 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 z-50"
            role="menu"
            aria-label="گزینه‌های حساب کاربری"
          >
            <div className="px-3 py-2 mb-1">
              <div className="text-[13px] font-black text-[#0F172A]">حساب کاربری</div>
              <div dir="ltr" className="text-[11px] text-slate-400 font-medium text-right mt-0.5">
                {state.principal?.userId}
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <button
              ref={logoutRef}
              onClick={() => void handleLogout()}
              disabled={state.busy}
              role="menuitem"
              className="mt-1 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-bold text-red-600 hover:bg-red-50 transition motion-reduce:transition-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
            >
              <LogOut size={16} /> خروج از حساب
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
