'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../state/auth-context'
import { bindWishlist, removeMergedGuestWishlist, guestWishlist } from '../../lib/wishlist'
type Result = { items: Array<{ id: string; slug: string }> }
/** Account lists stay in memory, never in guest storage; all requests bind to one login lifetime. */
export function WishlistSync() {
  const { state, request, restored, identityVersion } = useAuth()
  const userId = state.principal?.userId
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    bindWishlist(null, !restored || !!userId)
    if (!restored || !userId) return () => { active = false; bindWishlist(null, true) }
    const bound = request.forCurrentPrincipal()
    const sync = async () => {
      try {
        const slugs = guestWishlist()
        const response = slugs.length
          ? await bound<Result>('/api/v1/wishlist/merge', { method: 'POST', json: { slugs }, headers: { 'Idempotency-Key': crypto.randomUUID() } })
          : await bound<Result>('/api/v1/wishlist')
        if (!active) return
        // Clear only the snapshot that was actually merged, retaining any other-tab additions.
        if (guestWishlist().join('|') === slugs.join('|')) { try { removeMergedGuestWishlist(response.data.items.map(item => item.slug)) } catch { /* Merge is idempotent by product ID. */ } }
        let queue = Promise.resolve()
        bindWishlist({ items: response.data.items.map(item => item.slug), change: (slug, enabled) => {
          const operation = queue.then(async () => (await bound<Result>('/api/v1/wishlist', { method: 'PUT', json: { slug, enabled }, headers: { 'Idempotency-Key': crypto.randomUUID() } })).data.items.map(item => item.slug))
          queue = operation.then(() => undefined, () => undefined)
          return operation
        } })
        setError(false)
      } catch { if (active) setError(true) }
    }
    void sync()
    return () => { active = false; bindWishlist(null, true) }
  }, [userId, request, restored, identityVersion, retry])
  return error && userId ? <div role="alert" className="border-b border-amber-200 bg-amber-50 p-3 text-center text-sm">دریافت علاقه‌مندی‌های حساب انجام نشد. <button className="min-h-11 underline" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div> : null
}
