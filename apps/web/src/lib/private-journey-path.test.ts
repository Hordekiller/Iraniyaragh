import { describe, expect, it } from 'vitest'
import { isPrivateJourneyPath } from './private-journey-path'

describe('private journey HTTP route boundary', () => {
  it('preserves real customer routes and parameterized order/payment/invoice journeys', () => {
    for (const path of ['cart', 'checkout', 'search', 'bestsellers', 'account', 'account/addresses', 'account/security', 'account/credit', 'account/invoices', 'account/invoices/test-id', 'orders', 'orders/test-id', 'payment/test-id', 'payment/test-id/result', 'payment-return']) {
      expect(isPrivateJourneyPath(path.split('/')), path).toBe(true)
    }
  })
  it('does not turn arbitrary descendants or unknown routes into soft 404s', () => {
    for (const path of ['cart/anything', 'checkout/anything', 'account/unknown', 'account/invoices/test-id/extra', 'payment', 'payment/test-id/unknown', 'payment-return/anything', 'orders/test-id/extra', 'search/anything', 'unknown', 'Account']) {
      expect(isPrivateJourneyPath(path.split('/')), path).toBe(false)
    }
    expect(isPrivateJourneyPath(['orders', 'nested/id'])).toBe(false)
    expect(isPrivateJourneyPath(['orders', 'nested\\id'])).toBe(false)
    expect(isPrivateJourneyPath(['orders', ''])).toBe(false)
  })
})
