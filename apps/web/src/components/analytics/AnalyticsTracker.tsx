'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { ANALYTICS_MEASUREMENT_ID, CONSENT_EVENT, CONSENT_KEY, publicAnalyticsPath } from './analytics-policy'

type Choice = 'accepted' | 'rejected' | 'pending' | 'loading'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function getChoice(): Choice {
  const saved = window.localStorage.getItem(CONSENT_KEY)
  return saved === 'accepted' || saved === 'rejected' ? saved : 'pending'
}

function subscribe(onChange: () => void) {
  window.addEventListener(CONSENT_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function disableCollection(disabled: boolean) {
  ;(window as unknown as Record<string, unknown>)[`ga-disable-${ANALYTICS_MEASUREMENT_ID}`] = disabled
  window.gtag?.('consent', 'update', { analytics_storage: disabled ? 'denied' : 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
}

function configureTag(script: HTMLElement | null) {
  if (script?.dataset.configured === 'true') return true
  const gtag = window.gtag
  if (!gtag || getChoice() !== 'accepted') return false
  const publicPath = publicAnalyticsPath(window.location.pathname)
  if (!publicPath) return false
  gtag('js', new Date())
  gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' })
  gtag('config', ANALYTICS_MEASUREMENT_ID, {
    send_page_view: false,
    page_location: `${window.location.origin}${publicPath}`,
    page_referrer: '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  })
  if (script) script.dataset.configured = 'true'
  return true
}

export function AnalyticsTracker() {
  const pathname = usePathname()
  const choice = useSyncExternalStore(subscribe, getChoice, () => 'loading')
  const [configured, setConfigured] = useState(false)
  const lastTrackedPath = useRef<string | null>(null)

  useEffect(() => {
    const allowed = choice === 'accepted' && Boolean(publicAnalyticsPath(pathname))
    disableCollection(!allowed)
    if (!allowed) {
      lastTrackedPath.current = null
      return
    }
    window.dataLayer ??= []
    // Google tag commands are queued as Arguments objects, as in the official
    // gtag snippet. Plain arrays are not the same data-layer command format.
    // eslint-disable-next-line prefer-rest-params -- gtag.js requires the native Arguments object.
    window.gtag ??= function gtag() { window.dataLayer?.push(arguments) }
    const existing = document.getElementById('iraniyaragh-ga4')
    if (existing) {
      if (!configured) queueMicrotask(() => { if (configureTag(existing)) setConfigured(true) })
      return
    }
    const script = document.createElement('script')
    script.id = 'iraniyaragh-ga4'
    script.async = true
    script.src = 'https://www.googletagmanager.com/gtag/js?id=G-ERHW21LZXZ'
    // Queue consent and send_page_view:false before gtag.js starts running.
    // Configuring only in onload allows its automatic initial page view to fire.
    if (configureTag(script)) queueMicrotask(() => setConfigured(true))
    script.onload = () => { script.dataset.loaded = 'true' }
    document.head.appendChild(script)
  }, [choice, configured, pathname])

  useEffect(() => {
    const publicPath = publicAnalyticsPath(pathname)
    if (choice !== 'accepted' || !configured || !publicPath || lastTrackedPath.current === publicPath) return
    lastTrackedPath.current = publicPath
    window.gtag?.('event', 'page_view', {
      page_location: `${window.location.origin}${publicPath}`,
      page_path: publicPath,
      page_referrer: '',
      page_title: document.title,
    })
  }, [choice, configured, pathname])

  function saveChoice(next: 'accepted' | 'rejected') {
    window.localStorage.setItem(CONSENT_KEY, next)
    disableCollection(next !== 'accepted')
    if (next === 'accepted') {
      lastTrackedPath.current = null
      if (!configured && configureTag(document.getElementById('iraniyaragh-ga4'))) setConfigured(true)
    }
    window.dispatchEvent(new Event(CONSENT_EVENT))
  }

  return <>
    {choice === 'pending' && <aside role="dialog" aria-label="انتخاب آمار بازدید" className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 text-right text-sm leading-7 text-slate-800 shadow-xl" dir="rtl">
      <p>برای سنجش بازدیدهای عمومی سایت از Google Analytics استفاده می‌کنیم. فقط با رضایت شما فعال می‌شود؛ مسیرهای حساب، سبد خرید و تسویه‌حساب ثبت نمی‌شوند.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => saveChoice('accepted')} className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white focus-visible:outline-2 focus-visible:outline-orange-600">می‌پذیرم</button>
        <button type="button" onClick={() => saveChoice('rejected')} className="rounded-lg border border-slate-300 px-4 py-2 font-bold focus-visible:outline-2 focus-visible:outline-orange-600">رد می‌کنم</button>
      </div>
    </aside>}
  </>
}
