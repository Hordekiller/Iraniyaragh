import { describe, expect, it } from 'vitest'
import { MAX_CART_QUANTITY, LocalCartStorage } from './controller'
import type { CartLine } from './types'

const VALID: CartLine = {
  productId: 'p1',
  slug: 'ronix-2210-hammer-drill',
  name: 'دریل رونیکس ۲۲۱۰',
  brand: 'Ronix',
  image: '/images/hero1.jpg',
  unitPrice: { amount: '28500000', currency: 'IRR' },
  oldPrice: null,
  quantity: 2,
}

function invalid(line: Partial<CartLine>): CartLine {
  return { ...VALID, ...line } as CartLine
}

describe('LocalCartStorage', () => {
  it('starts empty when nothing was persisted', () => {
    const storage = new LocalCartStorage('k-empty')
    expect(storage.read().lines).toEqual([])
  })

  it('round-trips lines through localStorage', () => {
    const storage = new LocalCartStorage('k-roundtrip')
    storage.write({ lines: [VALID] })
    expect(storage.read().lines).toEqual([VALID])
  })

  it('supports the legacy plain-array shape', () => {
    window.localStorage.setItem('k-legacy-array', JSON.stringify([VALID]))
    const storage = new LocalCartStorage('k-legacy-array')
    expect(storage.read().lines).toEqual([VALID])
  })

  it('ignores malformed JSON', () => {
    window.localStorage.setItem('k-bad-json', 'not-json{{{')
    const storage = new LocalCartStorage('k-bad-json')
    expect(storage.read().lines).toEqual([])
  })

  it('drops invalid and duplicate lines and caps the merged quantity', () => {
    const duplicate = { ...VALID, quantity: 98 }
    const storage = new LocalCartStorage('k-dedup')
    storage.write({
      lines: [
        duplicate,
        VALID,
        invalid({ productId: '' }),
        invalid({ quantity: 0 }),
        invalid({ unitPrice: { amount: 'abc', currency: 'IRR' } }),
        invalid({ quantity: MAX_CART_QUANTITY + 10 }),
      ],
    })
    const lines = storage.read().lines
    expect(lines).toHaveLength(1)
    expect(lines[0].productId).toBe('p1')
    expect(lines[0].quantity).toBe(MAX_CART_QUANTITY)
  })
})