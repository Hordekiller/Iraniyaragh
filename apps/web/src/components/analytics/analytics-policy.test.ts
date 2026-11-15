import { describe, expect, it } from 'vitest'
import { publicAnalyticsPath } from './analytics-policy'

describe('publicAnalyticsPath', () => {
  it.each([
    '/', '/products/kolity-k63-soft-close-overlay-hinge', '/categories/hinges',
    '/brands', '/blog/a-guide', '/help/shipping', '/policies/privacy',
    '/contact', '/about', '/custom-doors', '/products/%D8%B1%DB%8C%D9%84-%DA%A9%D8%A7%D8%A8%DB%8C%D9%86%D8%AA',
  ])('permits the public content route %s', path => {
    expect(publicAnalyticsPath(path)).toBe(path)
  })

  it.each([
    '/search', '/search/hinges', '/account', '/account/orders', '/cart',
    '/checkout', '/orders/123', '/admin', '/api/v1/orders',
    '/products/encoded%2Fcheckout', '/products/slug/checkout',
  ])('excludes the private or unknown route %s', path => {
    expect(publicAnalyticsPath(path)).toBeNull()
  })
})
