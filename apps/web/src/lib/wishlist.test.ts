import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindWishlist, guestWishlist, setWishlisted, wishlistSlugs } from './wishlist'
describe('wishlist persistence and account isolation', () => {
  beforeEach(() => { localStorage.clear(); bindWishlist(null) })
  it('deduplicates guest entries, persists removal and bounds storage', async () => {
    await setWishlisted('hinge', true); await setWishlisted('hinge', true)
    expect(guestWishlist()).toEqual(['hinge'])
    await setWishlisted('hinge', false); expect(guestWishlist()).toEqual([])
    for (let i = 0; i < 40; i++) await setWishlisted(`item-${i}`, true)
    await expect(setWishlisted('overflow', true)).rejects.toThrow()
    expect(guestWishlist()).toHaveLength(40)
  })
  it('never writes an account list to guest storage, and ignores a stale account response', async () => {
    await setWishlisted('guest', true)
    let resolve!: (items: string[]) => void
    const change = vi.fn(() => new Promise<string[]>(done => { resolve = done }))
    bindWishlist({ items: ['account-private'], change })
    const pending = setWishlisted('account-next', true)
    bindWishlist(null, true)
    resolve(['account-private', 'account-next']); await pending
    expect(wishlistSlugs()).toEqual([])
    expect(guestWishlist()).toEqual(['guest'])
    bindWishlist(null); expect(wishlistSlugs()).toEqual(['guest'])
  })
  it('does not report successful persistence when browser storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => { throw new Error('blocked') })
    await expect(setWishlisted('hinge', true)).rejects.toThrow('blocked')
  })
})
