export const ANALYTICS_MEASUREMENT_ID = 'G-ERHW21LZXZ'
export const CONSENT_KEY = 'iraniyaragh_analytics_consent'
export const SETTINGS_EVENT = 'iraniyaragh:analytics-settings'
export const CONSENT_EVENT = 'iraniyaragh:analytics-consent'

function publicSlug(value: string) {
  try {
    const slug = decodeURIComponent(value)
    return slug.length <= 250 && slug === slug.normalize('NFC') && /^[a-z0-9\u0621-\u063A\u0641-\u0642\u0644-\u0648\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06F0-\u06F9]+(?:-[a-z0-9\u0621-\u063A\u0641-\u0642\u0644-\u0648\u067E\u0686\u0698\u06A9\u06AF\u06CC\u06F0-\u06F9]+)*$/u.test(slug)
  } catch { return false }
}

/** Never measure orders, identities, cart or checkout paths. */
export function publicAnalyticsPath(pathname: string): string | null {
  if (pathname === '/') return pathname
  if (/^\/(?:shop|catalog|bestsellers|categories|brands|blog|help|contact|about|custom-doors)\/?$/i.test(pathname)) return pathname
  const match = /^\/(?:products|categories|brands|blog|help|policies)\/([^/]+)\/?$/i.exec(pathname)
  if (match && publicSlug(match[1])) return pathname
  return null
}

export function openAnalyticsSettings() {
  window.localStorage.setItem(CONSENT_KEY, 'pending')
  window.dispatchEvent(new Event(SETTINGS_EVENT))
  window.dispatchEvent(new Event(CONSENT_EVENT))
}
