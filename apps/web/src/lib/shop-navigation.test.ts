import { describe, expect, it } from 'vitest'
import { navigationMode } from './shop-navigation'

describe('navigationMode', () => {
  it('keeps shopping context on every shop journey', () => {
    for (const path of ['/shop', '/catalog', '/categories', '/categories/locks', '/products/lock', '/brands/brand', '/search', '/bestsellers', '/cart', '/checkout', '/wishlist']) {
      expect(navigationMode(path, 'general'), path).toBe('shop')
    }
  })

  it('retains the saved context across account, orders and payment returns', () => {
    for (const path of ['/account', '/account/profile', '/orders', '/orders/example', '/payment/example', '/payment-return']) {
      expect(navigationMode(path, 'shop'), path).toBe('shop')
      expect(navigationMode(path, 'general'), path).toBe('general')
    }
  })

  it('returns to the main site on home and custom door routes', () => {
    for (const path of ['/', '/custom-doors', '/help', '/contact']) expect(navigationMode(path, 'shop')).toBe('general')
  })
})
