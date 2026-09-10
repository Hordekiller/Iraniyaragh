import { describe, expect, it } from 'vitest'
import { CartController, MAX_CART_QUANTITY } from './controller'
import type { CartLine } from './types'

class MemoryCartStore {
  state: CartLine[] = []
  read() { return { lines: this.state.map(line => ({ ...line })) } }
  write(next: { lines: CartLine[] }) { this.state = next.lines.map(line => ({ ...line })) }
}

const line: CartLine = {
  productId: 'p1',
  slug: 'tool',
  name: 'ابزار',
  brand: 'برند',
  image: '/tool.jpg',
  unitPrice: { amount: '1000000', currency: 'IRR' },
  oldPrice: null,
  quantity: 1,
}

describe('CartController', () => {
  it('caps quantities and removes invalid numeric updates', () => {
    const controller = new CartController(new MemoryCartStore())
    controller.add(line)
    controller.setQuantity('p1', 500)
    expect(controller.quantityOf('p1')).toBe(MAX_CART_QUANTITY)
    controller.setQuantity('p1', Number.NaN)
    expect(controller.quantityOf('p1')).toBe(0)
  })

  it('deduplicates persisted lines and ignores malformed lines', () => {
    const store = new MemoryCartStore()
    store.state = [line, { ...line, quantity: 2 }, { ...line, productId: 'bad', quantity: Number.NaN }]
    const controller = new CartController(store)
    expect(controller.quantityOf('p1')).toBe(3)
    expect(controller.quantityOf('bad')).toBe(0)
  })

  it('computes safe integer totals', () => {
    const controller = new CartController(new MemoryCartStore())
    controller.add(line)
    expect(controller.getTotals(450000)).toEqual({
      subtotalRials: 1000000,
      shippingRials: 450000,
      totalRials: 1450000,
      lineCount: 1,
      itemCount: 1,
    })
  })
})
