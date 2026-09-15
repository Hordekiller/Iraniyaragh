import { describe, expect, it } from 'vitest'
import { computeCartTotals, lineTotalRials } from './types'
import type { CartLine } from './types'

const LINE: CartLine = {
  productId: 'p1',
  slug: 'ronix-2210-hammer-drill',
  name: 'دریل رونیکس ۲۲۱۰',
  brand: 'Ronix',
  image: '/images/hero1.jpg',
  unitPrice: { amount: '28500000', currency: 'IRR' },
  oldPrice: null,
  quantity: 2,
}

describe('cart totals', () => {
  it('computes line totals and cart totals in Rial', () => {
    expect(lineTotalRials(LINE)).toBe(57000000)
    const totals = computeCartTotals([LINE], 450000)
    expect(totals.subtotalRials).toBe(57000000)
    expect(totals.shippingRials).toBe(450000)
    expect(totals.totalRials).toBe(57450000)
    expect(totals.lineCount).toBe(1)
    expect(totals.itemCount).toBe(2)
  })

  it('defaults the shipping charge to zero', () => {
    const totals = computeCartTotals([LINE])
    expect(totals.shippingRials).toBe(0)
    expect(totals.totalRials).toBe(57000000)
  })

  it('throws on unsafe line arithmetic', () => {
    expect(() => lineTotalRials({ ...LINE, unitPrice: { amount: String(Number.MAX_SAFE_INTEGER), currency: 'IRR' }, quantity: 99 })).toThrow(/exceeds the safe Rial calculation range/)
  })

  it('throws on a negative shipping charge', () => {
    expect(() => computeCartTotals([LINE], -1)).toThrow(/non-negative safe Rial integer/)
  })

  it('throws when the running subtotal overflows', () => {
    const big: CartLine = {
      ...LINE,
      unitPrice: { amount: String(Number.MAX_SAFE_INTEGER), currency: 'IRR' },
    }
    expect(() => computeCartTotals([big, big])).toThrow(/exceeds the safe Rial calculation range/)
  })
})