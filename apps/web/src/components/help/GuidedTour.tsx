'use client'

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { tourById, type TourStep } from '../../lib/help-tours'
import { getServerTourState, getTourState, setTourState, stopTour, subscribeTour } from '../../lib/help-tour-state'
import { useTargetBox } from '../../lib/use-target-box'
import { useAuth } from '../../state/auth-context'

/** On-page guide: highlights the real button of the current step and never acts for the customer. */
export function GuidedTour() {
  const tourState = useSyncExternalStore(subscribeTour, getTourState, getServerTourState)
  const auth = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const tour = tourState ? tourById(tourState.id) : undefined
  const signedIn = auth.state.phase === 'authenticated'

  // Steps that do not apply to this customer (guest-only vs signed-in-only) are skipped.
  const applicable = useMemo(() => (tour?.steps ?? []).map((step, index) => ({ step, index }))
    .filter(({ step }) => !step.when || (step.when === 'authenticated') === signedIn), [tour, signedIn])
  const current = tourState ? applicable.find(item => item.index >= tourState.index) ?? null : null
  const position = current ? applicable.findIndex(item => item.index === current.index) : -1

  const stepIndex = current?.index ?? -1
  const step: TourStep | undefined = current?.step
  const onRightPage = !step?.onRoute || new RegExp(step.onRoute, 'u').test(pathname)
  const selector = onRightPage ? step?.target : undefined

  const { box, element } = useTargetBox(selector, stepIndex)

  const go = useCallback((direction: 1 | -1) => {
    if (!tour || position < 0) return
    const target = applicable[position + direction]
    if (!target) { if (direction === 1) stopTour(); return }
    setTourState({ id: tour.id, index: target.index })
  }, [applicable, position, tour])

  // Past the last applicable step (e.g. the customer signed in): finish quietly.
  useEffect(() => { if (tourState && tour && !current) stopTour() }, [tourState, tour, current])
  useEffect(() => { if (tourState && !tour) stopTour() }, [tourState, tour])

  // "Click the highlighted button" steps move on by themselves once the customer does it.
  useEffect(() => {
    if (!step?.advanceOnClick || !element) return
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && element.contains(event.target)) window.setTimeout(() => go(1), 250)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [step, element, go])

  if (!tour || !step || !current) return null

  const total = applicable.length
  const last = position === total - 1
  const inBottomHalf = box !== null && box.top + box.height / 2 > window.innerHeight / 2
  const text = !onRightPage || (selector && !box) ? (step.missing ?? step.text) : step.text
  const showMissing = !onRightPage || (Boolean(selector) && !box)

  return <>
    {box && <div aria-hidden="true" data-testid="tour-spotlight" style={{ position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, pointerEvents: 'none', zIndex: 85, borderRadius: 14, boxShadow: '0 0 0 9999px rgba(15,23,42,0.6), 0 0 0 3px #ea580c' }} />}
    <section
      role="region"
      aria-label="راهنمای تعاملی"
      aria-live="polite"
      style={{ zIndex: 90, ...(inBottomHalf ? { top: 16 } : { bottom: 'max(16px, env(safe-area-inset-bottom))' }) }}
      className="fixed inset-x-0 mx-auto w-[min(92vw,420px)] rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-bold text-orange-800">{tour.title} · مرحلهٔ {(position + 1).toLocaleString('fa-IR')} از {total.toLocaleString('fa-IR')}</p>
        <button type="button" onClick={stopTour} aria-label="بستن راهنما" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><X size={18} aria-hidden="true" /></button>
      </div>
      <h2 className="mt-1 text-base font-black">{step.title}</h2>
      <p className={`mt-2 text-sm leading-7 ${showMissing ? 'rounded-2xl bg-amber-50 p-3 text-amber-900' : 'text-slate-700'}`}>{text}</p>
      {!onRightPage && step.goto && <button type="button" onClick={() => navigate(step.goto!.to)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-slate-900 px-5 text-sm font-bold text-white hover:bg-orange-800">{step.goto.label}</button>}
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={() => go(-1)} disabled={position === 0} className="min-h-11 rounded-full border border-slate-300 px-5 text-sm font-bold disabled:opacity-40">قبلی</button>
        <button type="button" onClick={() => go(1)} className="min-h-11 rounded-full bg-orange-700 px-6 text-sm font-black text-white hover:bg-orange-800">{last ? 'پایان' : 'بعدی'}</button>
      </div>
    </section>
  </>
}
