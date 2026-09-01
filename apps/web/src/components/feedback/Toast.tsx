import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { ToastContext } from './toast-context'

const TOAST_DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((message: string) => {
    setToast(message)
    setPaused(false)
  }, [])

  useEffect(() => {
    if (toast === null) return
    if (paused) return
    dismissTimer.current = setTimeout(() => {
      dismissTimer.current = null
      setToast(null)
    }, TOAST_DURATION_MS)
    return () => {
      if (dismissTimer.current !== null) {
        clearTimeout(dismissTimer.current)
        dismissTimer.current = null
      }
    }
  }, [toast, paused])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl text-sm font-bold flex items-center gap-2 border border-white/10"
            role="status"
            aria-live="polite"
          >
            <span className="flex items-center gap-2 min-w-0">✓ {toast}</span>
            <button
              type="button"
              onClick={() => {
                if (dismissTimer.current !== null) clearTimeout(dismissTimer.current)
                setToast(null)
              }}
              aria-label="بستن اعلان"
              className="w-7 h-7 ml-1 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  )
}