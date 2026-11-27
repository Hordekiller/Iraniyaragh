import { CONSENT_KEY, publicAnalyticsPath } from './analytics-policy'
type Event = 'shop_navigation' | 'view_item_list' | 'select_item' | 'select_promotion' | 'add_to_cart'
/** Public catalog IDs only. No query strings, identity, order IDs or checkout data. */
export function shopEvent(name: Event, payload: { item_list_id?: string; items?: Array<{ item_id: string; quantity?: number }>; promotion_id?: string; destination?: string }): boolean {
  if (typeof window === 'undefined') return false
  const path = publicAnalyticsPath(window.location.pathname)
  try { if (!path || window.localStorage.getItem(CONSENT_KEY) !== 'accepted' || !window.gtag) return false } catch { return false }
  window.gtag('event', name, { ...payload, page_location: `${window.location.origin}${path}`, page_referrer: '' })
  return true
}
