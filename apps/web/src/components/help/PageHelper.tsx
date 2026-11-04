'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CircleHelp, Maximize2, Minimize2, X } from 'lucide-react'
import { guideForPath, LOGIN_GUIDES, STAGES, type GuideItem, type HelpContext, type PageGuide } from '../../lib/help-pages'
import { getHelpRequest, getHelperCompact, getHelperOpen, getServerHelpRequest, getServerHelperCompact, getServerHelperOpen, getServerTourState, getTourState, setHelperCompact, setHelperOpen, subscribeCompact, subscribeHelper, subscribeRequest, subscribeTour } from '../../lib/help-tour-state'
import { firstVisible, useTargetBox } from '../../lib/use-target-box'
import { ROUTES } from '../../lib/routes'
import { useAuth } from '../../state/auth-context'
import { useCart } from '../../state/cart-context'

type LoginPhase = 'mobile' | 'code' | null

/** The sign-in dialog covers the page, so the helper follows whichever of its two steps is showing. */
function useLoginPhase(): LoginPhase {
  const [phase, setPhase] = useState<LoginPhase>(null)
  useEffect(() => {
    const read = () => setPhase(firstVisible('#login-otp-code') ? 'code' : firstVisible('#login-mobile') ? 'mobile' : null)
    read()
    const timer = window.setInterval(read, 300)
    return () => window.clearInterval(timer)
  }, [])
  return phase
}

const resolve = (value: string | ((ctx: HelpContext) => string), ctx: HelpContext) => typeof value === 'function' ? value(ctx) : value

/**
 * Follows the customer through the whole purchase: on every page the floating button
 * explains that page and highlights its real buttons, and it keeps following when the
 * customer moves to the next page. It never clicks or submits anything.
 */
export function PageHelper() {
  const open = useSyncExternalStore(subscribeHelper, getHelperOpen, getServerHelperOpen)
  const compact = useSyncExternalStore(subscribeCompact, getHelperCompact, getServerHelperCompact)
  const helpRequest = useSyncExternalStore(subscribeRequest, getHelpRequest, getServerHelpRequest)
  const [handledRequest, setHandledRequest] = useState(0)
  const tourActive = useSyncExternalStore(subscribeTour, getTourState, getServerTourState) !== null
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const { state: cart } = useCart()
  const loginPhase = useLoginPhase()
  const ctx: HelpContext = { signedIn: auth.state.phase === 'authenticated', cartCount: cart.cart.lines.reduce((sum, line) => sum + line.quantity, 0) }

  const guide: PageGuide = loginPhase ? LOGIN_GUIDES[loginPhase] : guideForPath(pathname)
  const [cursor, setCursor] = useState<{ id: string; index: number }>({ id: guide.id, index: 0 })
  // A "?" hint asked for a specific element: jump to that item (derived during render, no effect needed).
  if (helpRequest && helpRequest.nonce !== handledRequest) {
    setHandledRequest(helpRequest.nonce)
    const wanted = guide.items.findIndex(entry => entry.target?.includes(`"${helpRequest.target}"`))
    setCursor({ id: guide.id, index: Math.max(wanted, 0) })
  }
  const index = cursor.id === guide.id ? Math.min(cursor.index, Math.max(guide.items.length - 1, 0)) : 0
  const item: GuideItem | undefined = guide.items[index]
  const selector = open && !tourActive ? item?.target : undefined
  const { box } = useTargetBox(selector, guide.id)

  if (tourActive) return null
  if (!open) {
    return <button type="button" onClick={() => setHelperOpen(true)} aria-label="راهنمای این صفحه" aria-expanded={false}
      className={`page-helper-fab ${/^\/products?\//u.test(pathname) ? 'page-helper-fab-product' : ''}`}>
      <CircleHelp size={20} aria-hidden="true" /><span>راهنمای این صفحه</span>
    </button>
  }

  const stageIndex = guide.stage ? STAGES.findIndex(stage => stage.id === guide.stage) : -1
  const last = index >= guide.items.length - 1
  const notShown = Boolean(selector) && !box
  const inBottomHalf = box !== null && box.top + box.height / 2 > window.innerHeight / 2
  const go = (to: number) => setCursor({ id: guide.id, index: to })

  if (compact) {
    return <>
      {box && <div aria-hidden="true" data-testid="helper-spotlight" style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, pointerEvents: 'none', zIndex: 85, borderRadius: 14, boxShadow: '0 0 0 9999px rgba(15,23,42,0.35), 0 0 0 3px #ea580c' }} />}
      <section role="region" aria-label="راهنمای این صفحه" aria-live="polite" data-testid="helper-compact"
        style={{ zIndex: 90, bottom: 'calc(var(--mobile-nav-height, 0px) + max(8px, env(safe-area-inset-bottom)))' }}
        className="fixed inset-x-0 mx-auto flex w-[min(94vw,440px)] items-center gap-2 rounded-full border border-slate-200 bg-white py-1 ps-4 pe-1 text-slate-900 shadow-xl">
        <p className="min-w-0 flex-1 truncate text-xs font-bold">{item ? `${item.title}${notShown ? ' — اکنون دیده نمی‌شود' : ''}` : guide.title}</p>
        {item && guide.items.length > 1 && <button type="button" onClick={() => go(last ? 0 : index + 1)} className="min-h-11 rounded-full bg-orange-700 px-4 text-xs font-black text-white">{last ? 'از اول' : 'بعدی'}</button>}
        <button type="button" onClick={() => setHelperCompact(false)} aria-label="بزرگ کردن راهنما" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><Maximize2 size={16} aria-hidden="true" /></button>
        <button type="button" onClick={() => { setHelperCompact(false); setHelperOpen(false) }} aria-label="بستن راهنما" className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X size={16} aria-hidden="true" /></button>
      </section>
    </>
  }

  return <>
    {box && <div aria-hidden="true" data-testid="helper-spotlight" style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, pointerEvents: 'none', zIndex: 85, borderRadius: 14, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6), 0 0 0 3px #ea580c' }} />}
    <section role="region" aria-label="راهنمای این صفحه" aria-live="polite"
      style={{ zIndex: 90, maxHeight: '70vh', overflowY: 'auto', ...(inBottomHalf ? { top: 16 } : { bottom: 'max(16px, env(safe-area-inset-bottom))' }) }}
      className="fixed inset-x-0 mx-auto w-[min(94vw,440px)] rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl">
      <div className="flex items-start justify-between gap-3">
        <ol aria-label="مراحل خرید" className="flex min-w-0 flex-1 flex-wrap gap-1 text-[10px] font-bold">
          {STAGES.map((stage, i) => <li key={stage.id} aria-current={i === stageIndex ? 'step' : undefined}
            className={`rounded-full px-2 py-1 ${i === stageIndex ? 'bg-orange-700 text-white' : i < stageIndex ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-500'}`}>{stage.label}</li>)}
        </ol>
        <button type="button" onClick={() => setHelperCompact(true)} aria-label="کوچک کردن راهنما" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><Minimize2 size={17} aria-hidden="true" /></button>
        <button type="button" onClick={() => setHelperOpen(false)} aria-label="بستن راهنما" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
      </div>
      <h2 className="mt-3 text-base font-black">{guide.title}</h2>
      <p className="mt-1 text-sm leading-7 text-slate-700">{resolve(guide.summary, ctx)}</p>
      {item && <div className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-3">
        <p className="text-xs font-bold text-orange-900">{(index + 1).toLocaleString('fa-IR')} از {guide.items.length.toLocaleString('fa-IR')} · {item.title}</p>
        <p className={`mt-1 text-sm leading-7 ${notShown ? 'rounded-xl bg-amber-100 p-2 text-amber-950' : 'text-orange-950'}`}>{notShown ? (item.missing ?? 'این بخش اکنون روی صفحه دیده نمی‌شود.') : resolve(item.text, ctx)}</p>
      </div>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {guide.items.length > 0 && <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="min-h-11 rounded-full border border-slate-300 px-5 text-sm font-bold disabled:opacity-40">قبلی</button>}
        {guide.items.length > 0 && !last && <button type="button" onClick={() => go(index + 1)} className="min-h-11 rounded-full bg-orange-700 px-6 text-sm font-black text-white hover:bg-orange-800">بعدی</button>}
        {(last || guide.items.length === 0) && guide.next && <button type="button" onClick={() => navigate(guide.next!.to)} className="min-h-11 rounded-full bg-orange-700 px-5 text-sm font-black text-white hover:bg-orange-800">مرحلهٔ بعد: {guide.next.label}</button>}
        {(last || guide.items.length === 0) && !guide.next && <button type="button" onClick={() => setHelperOpen(false)} className="min-h-11 rounded-full bg-orange-700 px-6 text-sm font-black text-white hover:bg-orange-800">متوجه شدم</button>}
      </div>
      <p className="mt-3 text-xs leading-6 text-slate-500">با رفتن به صفحهٔ بعد، راهنما همان صفحه را توضیح می‌دهد. راهنما به‌جای شما کلیک یا ثبت نمی‌کند. <Link to={ROUTES.help} className="font-bold underline">مرکز راهنما</Link></p>
    </section>
  </>
}
