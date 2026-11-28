const KEY = 'iranyaragh:recent-products:v1'
const EVENT = 'iranyaragh:recent-products-changed'
const MAX_ITEMS = 8

export function recentProductSlugs(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter((slug): slug is string => typeof slug === 'string' && /^[\p{L}\p{N}-]{1,250}$/u.test(slug)))].slice(0, MAX_ITEMS) : []
  } catch { return [] }
}

export function recordRecentProduct(slug: string) {
  if (!/^[\p{L}\p{N}-]{1,250}$/u.test(slug)) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify([slug, ...recentProductSlugs().filter(item => item !== slug)].slice(0, MAX_ITEMS)))
    window.dispatchEvent(new Event(EVENT))
  } catch { /* Storage may be disabled. */ }
}

export function subscribeRecentProducts(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}
