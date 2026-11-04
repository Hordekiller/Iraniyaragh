/** Tiny external store so a tour survives page navigation inside the same tab. */
export interface TourState { id: string; index: number }

const KEY = 'iraniyaragh:help-tour'
const listeners = new Set<() => void>()
let state: TourState | null = null
let hydrated = false

function hydrate() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.sessionStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) as Partial<TourState> : null
    if (parsed && typeof parsed.id === 'string' && Number.isInteger(parsed.index)) state = { id: parsed.id, index: parsed.index as number }
  } catch { /* storage may be blocked; the tour then lives in memory only */ }
}

export function getTourState(): TourState | null { hydrate(); return state }
export function getServerTourState(): TourState | null { return null }

export function setTourState(next: TourState | null) {
  hydrate()
  state = next
  try {
    if (next) window.sessionStorage.setItem(KEY, JSON.stringify(next))
    else window.sessionStorage.removeItem(KEY)
  } catch { /* ignore */ }
  listeners.forEach(listener => listener())
}

export function subscribeTour(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export const startTour = (id: string) => setTourState({ id, index: 0 })
export const stopTour = () => setTourState(null)

/** Whether the always-available page helper panel is open (kept across navigation). */
const HELPER_KEY = 'iraniyaragh:help-helper'
const helperListeners = new Set<() => void>()
let helperOpen = false
let helperHydrated = false

export function getHelperOpen(): boolean {
  if (!helperHydrated && typeof window !== 'undefined') {
    helperHydrated = true
    try { helperOpen = window.sessionStorage.getItem(HELPER_KEY) === '1' } catch { /* memory only */ }
  }
  return helperOpen
}
export const getServerHelperOpen = () => false
export function setHelperOpen(open: boolean) {
  getHelperOpen()
  helperOpen = open
  try { if (open) window.sessionStorage.setItem(HELPER_KEY, '1'); else window.sessionStorage.removeItem(HELPER_KEY) } catch { /* ignore */ }
  helperListeners.forEach(listener => listener())
}
export function subscribeHelper(listener: () => void) {
  helperListeners.add(listener)
  return () => { helperListeners.delete(listener) }
}

/** Compact mode: the helper shrinks to a slim bar so it never covers the page. */
const COMPACT_KEY = 'iraniyaragh:help-compact'
const compactListeners = new Set<() => void>()
let compact = false
let compactHydrated = false
export function getHelperCompact(): boolean {
  if (!compactHydrated && typeof window !== 'undefined') {
    compactHydrated = true
    try { compact = window.sessionStorage.getItem(COMPACT_KEY) === '1' } catch { /* memory only */ }
  }
  return compact
}
export const getServerHelperCompact = () => false
export function setHelperCompact(value: boolean) {
  getHelperCompact()
  compact = value
  try { if (value) window.sessionStorage.setItem(COMPACT_KEY, '1'); else window.sessionStorage.removeItem(COMPACT_KEY) } catch { /* ignore */ }
  compactListeners.forEach(listener => listener())
}
export function subscribeCompact(listener: () => void) {
  compactListeners.add(listener)
  return () => { compactListeners.delete(listener) }
}

/** A "?" hint next to a field asks the helper to open on that exact button/field. */
export interface HelpRequest { target: string; nonce: number }
let request: HelpRequest | null = null
const requestListeners = new Set<() => void>()
export const getHelpRequest = () => request
export const getServerHelpRequest = (): HelpRequest | null => null
export function requestHelp(target: string) {
  request = { target, nonce: (request?.nonce ?? 0) + 1 }
  setHelperOpen(true)
  requestListeners.forEach(listener => listener())
}
export function subscribeRequest(listener: () => void) {
  requestListeners.add(listener)
  return () => { requestListeners.delete(listener) }
}
