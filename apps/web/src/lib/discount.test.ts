import { describe, expect, it } from 'vitest'
import { verifiedDiscountPercent } from './discount'

const money = (amount: string) => ({ amount, currency: 'IRR' }) as never

describe('verifiedDiscountPercent', () => {
  it('is null without a recorded previous price or when price is unavailable', () => {
    expect(verifiedDiscountPercent({ price: money('1000'), oldPrice: null })).toBeNull()
    expect(verifiedDiscountPercent({ price: money('0'), oldPrice: money('1000'), priceAvailable: false })).toBeNull()
  })
  it('never invents a discount when the previous price is not higher', () => {
    expect(verifiedDiscountPercent({ price: money('1000'), oldPrice: money('1000') })).toBeNull()
    expect(verifiedDiscountPercent({ price: money('1200'), oldPrice: money('1000') })).toBeNull()
  })
  it('rounds the real difference to a whole percent', () => {
    expect(verifiedDiscountPercent({ price: money('750'), oldPrice: money('1000') })).toBe(25)
  })
})
