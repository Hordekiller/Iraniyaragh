import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Smartphone, X } from 'lucide-react'
import { normalizeIranianMobile } from '../../lib/auth/normalize'
import { useAuth } from '../../state/auth-context'

type LoginDialogProps = {
  open: boolean
  onClose: () => void
}

const RESEND_TICK_MS = 1000
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { state, controller } = useAuth()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const dialogRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  const resendWaitMs = Math.max(0, state.resendNotBefore - nowMs)
  const resendLocked = resendWaitMs > 0
  const rateLimitWaitMs = Math.max(0, state.rateLimitNotBefore - nowMs)
  const rateLimitLocked = rateLimitWaitMs > 0
  const expiryWaitMs =
    state.phase === 'code' && state.expiresAt !== null
      ? Math.max(0, state.expiresAt - nowMs)
      : 0
  const expiryPending = expiryWaitMs > 0
  const cooldownMs = rateLimitLocked ? rateLimitWaitMs : resendLocked ? resendWaitMs : 0
  const canSubmitMobile = !rateLimitLocked && normalizeIranianMobile(state.mobile) !== null
  const canSubmitCode = !rateLimitLocked && state.code.length === 6
  const lockedLabel = cooldownMs > 0 ? ` (${formatCountdown(cooldownMs)})` : ''

  useEffect(() => {
    if (!open || (!resendLocked && !rateLimitLocked && !expiryPending)) return
    const timer = setInterval(() => setNowMs(Date.now()), RESEND_TICK_MS)
    return () => clearInterval(timer)
  }, [expiryPending, open, rateLimitLocked, resendLocked])

  useEffect(() => {
    if (
      open &&
      state.phase === 'code' &&
      state.expiresAt !== null &&
      nowMs >= state.expiresAt
    ) {
      controller.expireChallenge()
    }
  }, [controller, nowMs, open, state.expiresAt, state.phase])

  useEffect(() => {
    if (!open) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    controller.open()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      controller.close()
      previouslyFocused?.focus()
    }
  }, [controller, onClose, open])

  useEffect(() => {
    if (!open) return
    const focusFrame = requestAnimationFrame(() => {
      setNowMs(Date.now())
      const inputId = state.phase === 'code' ? 'login-otp-code' : 'login-mobile'
      dialogRef.current?.querySelector<HTMLElement>(`#${inputId}`)?.focus()
    })
    return () => cancelAnimationFrame(focusFrame)
  }, [open, state.phase])

  // Auto-close the dialog as soon as login succeeds.
  useEffect(() => {
    if (open && state.phase === 'authenticated') onClose()
  }, [open, state.phase, onClose])

  function handleSubmitMobile(e: React.FormEvent) {
    e.preventDefault()
    void controller.requestOtp()
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault()
    void controller.verifyOtp()
  }

  function handleClose() {
    onClose()
  }

  return (
    <AnimatePresence initial={!reduceMotion}>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            ref={dialogRef}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-dialog-title"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between px-6 pt-5">
              <button
                onClick={handleClose}
                aria-label="بستن"
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
              >
                <X size={17} />
              </button>
              <span className="text-[11px] font-bold text-slate-400">ورود به ایران یراق</span>
              <span className="w-9" />
            </div>

            <div className="px-6 pb-7 pt-3">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-[#FF4D00]/10 flex items-center justify-center text-[#FF4D00] mb-3">
                  {state.phase === 'code' ? <KeyRound size={26} /> : <Smartphone size={26} />}
                </div>
                <h2 id="login-dialog-title" className="text-lg font-black text-[#0F172A]">
                  {state.phase === 'code' ? 'کد تایید را وارد کنید' : 'ورود با شماره موبایل'}
                </h2>
                <p className="text-[13px] text-slate-500 mt-1 leading-6">
                  {state.phase === 'code' ? (
                    <>کدی که برای {state.mobile} پیامک شد را وارد کنید</>
                  ) : (
                    <>کد تایید یک‌بارمصرف برای شما پیامک می‌شود</>
                  )}
                </p>
              </div>

              {state.error && (
                <div
                  id="login-dialog-error"
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                  className="mb-4 px-4 py-2.5 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12.5px] font-bold text-center"
                >
                  {state.error}
                </div>
              )}

              <span aria-live="polite" role="status" className="sr-only">
                {state.phase === 'code'
                  ? 'مرحله ۲ از ۲: درج کد تایید'
                  : 'مرحله ۱ از ۲: درج شماره موبایل'}
                {resendLocked || rateLimitLocked
                  ? `، ارسال مجدد در ${formatCountdown(cooldownMs)}`
                  : ''}
              </span>

              <AnimatePresence mode="wait">
                {state.phase !== 'code' ? (
                  <motion.form
                    key="mobile"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    onSubmit={handleSubmitMobile}
                  >
                    <div className="relative">
                      <label htmlFor="login-mobile" className="sr-only">
                        شماره موبایل
                      </label>
                      <input
                        id="login-mobile"
                        dir="ltr"
                        inputMode="tel"
                        aria-invalid={Boolean(state.error)}
                        aria-describedby={state.error ? 'login-dialog-error' : undefined}
                        value={state.mobile}
                        onChange={e => controller.setMobile(e.target.value)}
                        placeholder="۰۹۱۲ ۳۴۵ ۶۷۸۹"
                        className="w-full h-[52px] px-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-[17px] font-bold tracking-widest text-[#0F172A] placeholder:text-slate-300 placeholder:text-[13px] placeholder:font-medium placeholder:tracking-normal focus:outline-none focus:border-[#FF4D00]/50 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!canSubmitMobile || state.busy}
                      className="mt-4 w-full h-12 rounded-2xl bg-[#FF4D00] text-white font-black text-[15px] flex items-center justify-center gap-2 hover:bg-[#e84600] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {state.busy ? (
                        <>
                          <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
                          <span className="sr-only">در حال درخواست کد تایید</span>
                        </>
                      ) : (
                        <>
                          {rateLimitLocked ? `تلاش مجدد${lockedLabel}` : 'دریافت کد تایید'} <ArrowLeft size={18} />
                        </>
                      )}
                    </button>
                  </motion.form>
                ) : (
                  <motion.form
                    key="code"
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    onSubmit={handleSubmitCode}
                  >
                    <label htmlFor="login-otp-code" className="sr-only">
                      کد تایید
                    </label>
                    <input
                      id="login-otp-code"
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-invalid={Boolean(state.error)}
                      aria-describedby={state.error ? 'login-dialog-error' : undefined}
                      value={state.code}
                      onChange={e => controller.setCode(e.target.value)}
                      placeholder="••••••"
                      className="w-full h-[60px] bg-slate-50 border border-slate-200 rounded-2xl text-center text-[24px] font-black tracking-[0.5em] text-[#0F172A] placeholder:text-slate-300 focus:outline-none focus:border-[#FF4D00]/50 focus:bg-white focus:ring-4 focus:ring-[#FF4D00]/10 transition"
                    />
                    <button
                      type="submit"
                      disabled={!canSubmitCode || state.busy}
                      className="mt-4 w-full h-12 rounded-2xl bg-[#FF4D00] text-white font-black text-[15px] flex items-center justify-center gap-2 hover:bg-[#e84600] disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      {state.busy ? (
                        <>
                          <Loader2 size={18} className="animate-spin motion-reduce:animate-none" />
                          <span className="sr-only">در حال بررسی کد تایید</span>
                        </>
                      ) : (
                        <>
                          {rateLimitLocked ? `تلاش مجدد${lockedLabel}` : 'ورود به حساب'} <ArrowLeft size={18} />
                        </>
                      )}
                    </button>

                    <div className="mt-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => controller.resetChallenge()}
                        className="flex items-center gap-1 text-[12.5px] font-bold text-slate-500 hover:text-[#FF4D00] transition motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 rounded-md"
                      >
                        <ArrowRight size={15} /> تغییر شماره
                      </button>
                      <button
                        type="button"
                        onClick={() => void controller.resend()}
                        disabled={resendLocked || rateLimitLocked || state.busy}
                        className="text-[12.5px] font-bold text-[#FF4D00] hover:underline disabled:text-slate-400 disabled:no-underline disabled:cursor-not-allowed transition"
                      >
                        {resendLocked || rateLimitLocked ? `ارسال مجدد (${formatCountdown(cooldownMs)})` : 'ارسال مجدد کد'}
                      </button>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <p className="mt-5 text-[11px] text-slate-400 text-center leading-5">
                با ورود، قوانین و مقررات ایران یراق را می‌پذیرید.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
