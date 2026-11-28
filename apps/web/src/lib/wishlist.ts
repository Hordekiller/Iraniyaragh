const KEY = 'iranyaragh:wishlist:v1'
const EVENT = 'iranyaragh:wishlist-changed'
const valid = (slug: unknown): slug is string => typeof slug === 'string' && /^[\p{L}\p{N}-]{1,250}$/u.test(slug)
type Session = { items: string[]; change: (slug: string, enabled: boolean) => Promise<string[]> }
let session: Session | null = null
let restoring = false
const notify = () => window.dispatchEvent(new Event(EVENT))
export function guestWishlist(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(value) ? [...new Set(value.filter(valid))].slice(0, 40) : []
  } catch { return [] }
}
export function wishlistSlugs(): string[] { return session?.items ?? (restoring ? [] : guestWishlist()) }
export function bindWishlist(value: Session | null, pending = false) { session = value; restoring = pending; notify() }
export function removeMergedGuestWishlist(slugs: string[]) { window.localStorage.setItem(KEY, JSON.stringify(guestWishlist().filter(slug => !slugs.includes(slug)))) }
export async function setWishlisted(slug: string, enabled: boolean) {
  if (!valid(slug)) throw new Error('Invalid product')
  if (restoring) throw new Error('Wishlist is loading')
  if (session) {
    const bound = session
    const items = await bound.change(slug, enabled)
    if (session === bound) { bound.items = items; notify() }
    return
  }
  const existing = guestWishlist().filter(item => item !== slug)
  if (enabled && existing.length >= 40) throw new Error('Wishlist limit reached')
  window.localStorage.setItem(KEY, JSON.stringify(enabled ? [slug, ...existing] : existing))
  notify()
}
export function subscribeWishlist(callback: () => void) {
  window.addEventListener(EVENT, callback)
  window.addEventListener('storage', callback)
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback) }
}
