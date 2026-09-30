import { useCallback, useEffect, useState } from 'react'
import { LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useAuth } from '../../state/auth-context'
import { isApiError } from '../../lib/auth/errors'
import type { SessionSummary } from '../../lib/auth/types'
import { formatTimestamp, toPersianDigits } from '../../lib/format'
import { useToast } from '../feedback/toast-context'
import { InlineConfirm } from '../feedback/InlineConfirm'

/**
 * Active-session security panel.
 *
 * The API is the authority for which devices hold a live session
 * (`GET /api/v1/auth/sessions`); this panel only mirrors it. It never renders a
 * token, a session id or any other credential — a device row shows the
 * server-supplied device name and timestamps only. Both destructive actions
 * (revoke one session, revoke the whole family) require an explicit
 * confirmation, and "revoke everything" additionally re-prompts for the OTP
 * when the API answers `AUTH_REAUTHENTICATION_REQUIRED` (it demands an
 * authentication no older than five minutes).
 */
type PanelState =
  | { phase: 'loading' }
  | { phase: 'ready'; sessions: SessionSummary[] }
  | { phase: 'error'; message: string; needsReauth: boolean }
  | { phase: 'needs-reauth' }

function describeSession(session: SessionSummary): string {
  if (session.deviceName) return session.deviceName
  // The API may report no device name at all; inventing one would be a lie, so
  // the level is stated instead and the id is deliberately never shown.
  return session.authenticationLevel === 'STAFF_MFA' ? 'این دستگاه (ورود پرسنلی)' : 'این دستگاه'
}

export function AccountSessionsPanel() {
  const { api, controller, store } = useAuth()
  const { show } = useToast()
  const [panel, setPanel] = useState<PanelState>({ phase: 'loading' })
  const [busySession, setBusySession] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<'logout-all' | string | null>(null)
  const [logoutAllBusy, setLogoutAllBusy] = useState(false)

  const currentSessionId = store.getPrincipal()?.sessionId ?? null

  const load = useCallback((): Promise<void> => {
    return api
      .listSessions()
      .then(sessions => setPanel({ phase: 'ready', sessions }))
      .catch((cause: unknown) => {
        const needsReauth = isApiError(cause) && cause.code === 'AUTH_REAUTHENTICATION_REQUIRED'
        setPanel({
          phase: 'error',
          message: isApiError(cause) ? cause.message : 'دریافت فهرست دستگاه‌های فعال ممکن نشد.',
          needsReauth,
        })
      })
  }, [api])

  useEffect(() => {
    void load()
  }, [load])

  const revoke = useCallback(
    async (sessionId: string) => {
      setBusySession(sessionId)
      setConfirming(null)
      try {
        await api.revokeSession(sessionId)
        // Revoking this browser's own session destroyed its only live
        // credential, so the UI must fall back to the signed-out state instead
        // of still rendering an account panel.
        if (!store.isAuthenticated()) {
          show('این دستگاه از حساب خارج شد')
          return
        }
        show('دستگاه انتخاب‌شده از حساب خارج شد')
        await load()
      } catch (cause) {
        show(isApiError(cause) ? cause.message : 'خروج آن دستگاه از حساب ممکن نشد.')
        await load()
      } finally {
        setBusySession(null)
      }
    },
    [api, load, show, store],
  )

  const logoutAll = useCallback(async () => {
    setLogoutAllBusy(true)
    setConfirming(null)
    try {
      await api.logoutAll()
      show('از همه دستگاه‌ها خارج شدید')
    } catch (cause) {
      if (isApiError(cause) && cause.code === 'AUTH_REAUTHENTICATION_REQUIRED') {
        // Never retry blindly: the API wants a fresh OTP proof for this action.
        setPanel({ phase: 'needs-reauth' })
      } else {
        show(isApiError(cause) ? cause.message : 'خروج از همه دستگاه‌ها ممکن نشد.')
      }
    } finally {
      setLogoutAllBusy(false)
    }
  }, [api, show])

  const reauthenticate = useCallback(() => {
    setPanel({ phase: 'loading' })
    controller.open()
  }, [controller])

  return (
    <section
      aria-labelledby="account-sessions-heading"
      className="mt-4 rounded-[24px] border border-slate-100 bg-white p-5 lg:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-slate-900 font-black text-sm">
          <ShieldCheck size={18} aria-hidden="true" />
          <h2 id="account-sessions-heading">دستگاه‌های فعال</h2>
        </div>
        <button
          type="button"
          onClick={() => { void load() }}
          disabled={panel.phase === 'loading'}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:border-slate-900 hover:text-slate-900 transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
        >
          <RefreshCw size={14} aria-hidden="true" />
          به‌روزرسانی
        </button>
      </div>
      <p className="mt-2 text-xs leading-6 text-slate-500">
        هر دستگاهی که با شمارهٔ شما وارد شده باشد، تا زمانی که آن را در این فهرست ببینید به سفارش‌ها و اطلاعات حساب دسترسی دارد.
      </p>

      {panel.phase === 'loading' && (
        <p role="status" className="mt-4 text-sm text-slate-500">در حال دریافت دستگاه‌های فعال...</p>
      )}

      {panel.phase === 'error' && (
        <div role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-bold">{panel.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { void load() }}
              className="h-9 px-4 rounded-full border border-red-300 text-xs font-bold hover:bg-red-100 transition"
            >
              تلاش دوباره
            </button>
            {panel.needsReauth && (
              <button
                type="button"
                onClick={reauthenticate}
                className="h-9 px-4 rounded-full bg-[#0F172A] text-white text-xs font-bold hover:bg-black transition"
              >
                ورود دوباره
              </button>
            )}
          </div>
        </div>
      )}

      {panel.phase === 'needs-reauth' && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-bold flex items-center gap-2">
            <TriangleAlert size={16} aria-hidden="true" />
            برای خروج از همهٔ دستگاه‌ها، ورود دوباره لازم است
          </p>
          <p className="mt-1 leading-6">
            این عملیات حساس است و فقط با تأیید شمارهٔ شما انجام می‌شود. پس از ورود دوباره دوباره تلاش کنید.
          </p>
          <button
            type="button"
            onClick={reauthenticate}
            className="mt-3 h-9 px-4 rounded-full bg-[#0F172A] text-white text-xs font-bold hover:bg-black transition"
          >
            دریافت کد و ورود دوباره
          </button>
        </div>
      )}

      {panel.phase === 'ready' && (
        <>
          {panel.sessions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">هیچ دستگاه فعالی برای این حساب ثبت نشده است.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {panel.sessions.map(session => {
                const isCurrent = session.current || session.sessionId === currentSessionId
                const confirmingThis = confirming === session.sessionId
                return (
                  <li key={session.sessionId} className="py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                          <MonitorSmartphone size={18} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm truncate">
                              {describeSession(session)}
                            </span>
                            {isCurrent && (
                              <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[10px] font-bold">
                                همین دستگاه
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {session.lastUsedAt
                              ? `آخرین استفاده: ${formatTimestamp(session.lastUsedAt)}`
                              : 'هنوز استفاده‌ای ثبت نشده'}
                            {' · '}
                            اعتبار تا {formatTimestamp(session.expiresAt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <InlineConfirm
                          question={isCurrent ? 'از این دستگاه خارج می‌شوید؟' : 'این دستگاه از حساب خارج شود؟'}
                          confirmLabel="بله، خارج کن"
                          confirmClassName="h-9 px-3 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition disabled:opacity-50"
                          cancelClassName="h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
                          busy={busySession === session.sessionId}
                          onCancel={() => setConfirming(null)}
                          onConfirm={() => { void revoke(session.sessionId) }}
                        >
                          {trigger => (
                            <button
                              onClick={trigger.onClick}
                              type="button"
                              className="h-9 px-3 rounded-full border border-slate-200 text-xs font-bold text-slate-600 hover:border-red-600 hover:text-red-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
                            >
                              {isCurrent ? 'خروج از این دستگاه' : 'خروج آن دستگاه'}
                            </button>
                          )}
                        </InlineConfirm>
                      </div>
                    </div>
                    {confirmingThis && (
                      <p className="mt-2 text-xs leading-6 text-slate-500">
                        {isCurrent
                          ? 'با خروج از این دستگاه، همین نشست بسته می‌شود و باید دوباره وارد شوید.'
                          : 'دستگاه انتخاب‌شده بلافاصله از حساب خارج می‌شود و دسترسی به سفارش‌های شما قطع می‌گردد.'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-slate-100 pt-4">
              <InlineConfirm
                question="از همهٔ دستگاه‌ها خارج می‌شوید؟"
                description="همهٔ نشست‌های فعال این حساب بسته می‌شود و از همهٔ دستگاه‌ها باید دوباره وارد شوید."
                confirmLabel="بله، از همه خارج شو"
                confirmClassName="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition disabled:opacity-50"
                cancelClassName="h-9 px-4 rounded-full border border-slate-300 text-xs font-bold text-slate-700 hover:bg-white transition"
                busy={logoutAllBusy}
                onCancel={() => setConfirming(null)}
                onConfirm={() => { void logoutAll() }}
              >
                {trigger => (
                  <button
                    onClick={trigger.onClick}
                    type="button"
                    className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-slate-200 text-xs font-bold text-slate-700 hover:border-red-600 hover:text-red-600 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00]"
                  >
                    <LogOut size={15} aria-hidden="true" />
                    خروج از همهٔ دستگاه‌ها
                  </button>
                )}
              </InlineConfirm>
            <p className="mt-2 text-[11px] text-slate-500">
              {toPersianDigits(panel.sessions.length)} نشست فعال
            </p>
          </div>
        </>
      )}
    </section>
  )
}
