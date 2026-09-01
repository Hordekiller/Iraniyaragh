import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, KeyRound, Loader2, Smartphone, X } from 'lucide-react'
import { useAuth } from '../../state/auth-context'

type LoginDialogProps = {
  open: boolean
  onClose: () => void
}

const RESEND_TICK_MS = 1000

function formatCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function LoginDialog({ open, onClose }: LoginDialogProps) {
  const { state, controller } = useAuth()
  const [nowMs, setNowMs] = useState(() => Date.now())

  const resendWaitMs = Math.max(0, state.resendNotBefore - nowMs)
  const resendLocked = resendWaitMs > 0
  const rateLimitWaitMs = Math.max(0, state.rateLimitNotBefore - nowMs)
  const rateLimitLocked = rateLimitWaitMs > 0
  const cooldownMs = rateLimitLocked ? rateLimitWaitMs : resendLocked ? resendWaitMs : 0
  const canSubmitMobile =
    !rateLimitLocked && /^[0-9۰-۹٠-٩]{10,15}$/.test(state.mobile.trim())
  const canSubmitCode = !rateLimitLocked && state.code.length === 6
  const lockedLabel = cooldownMs > 0 ? ` (${formatCountdown(cooldownMs)})` : ''

  useEffect(() => {
    if (!resendLocked && !rateLimitLocked) return
    const timer = setInterval(() => setNowMs(Date.now()), RESEND_TICK_MS)
    return () => clearInterval(timer)
  }, [resendLocked, rateLimitLocked])

  useEffect(() => {
    if (!open) return
    controller.open()
    return () => controller.close()
    // Synchronize dialog visibility with the controller phase exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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
    controller.close()
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-dialog-title"
          >
            <div className="flex items-center justify-between px-6 pt-5">
              <button
                onClick={handleClose}
                aria-label="بستن"
                className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition"
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
                    onSubmit={handleSubmitMobile}
                  >
                    <div className="relative">
                      <input
                        autoFocus
                        dir="ltr"
                        inputMode="tel"
                        aria-label="شماره موبایل"
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
                        <Loader2 size={18} className="animate-spin" />
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
                    onSubmit={handleSubmitCode}
                  >
                    <input
                      autoFocus
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      aria-label="کد تایید"
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
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <>
                          {rateLimitLocked ? `تلاش مجدد${lockedLabel}` : 'ورود به حساب'} <ArrowLeft size={18} />
                        </>
                      )}
                    </button>

                    <div className="mt-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={handleClose}
                        className="flex items-center gap-1 text-[12.5px] font-bold text-slate-500 hover:text-[#FF4D00] transition"
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
