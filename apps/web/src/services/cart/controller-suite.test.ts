import { describe, expect, it } from 'vitest'
import { CartController, LocalCartStorage } from './controller'
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

function makeController() {
  const storage = new LocalCartStorage(`it-${Math.random().toString(36).slice(2)}`)
  return { storage, controller: new CartController(storage) }
}

describe('CartController', () => {
  it('ignores invalid lines', () => {
    const { controller } = makeController()
    controller.add({ ...VALID, quantity: 0 })
    controller.add({ ...VALID, unitPrice: { amount: 'nope', currency: 'IRR' } })
    expect(controller.getState().lines).toHaveLength(0)
  })

  it('bumps the quantity and caps it at MAX_CART_QUANTITY for duplicates', () => {
    const { controller } = makeController()
    controller.add(VALID)
    controller.add({ ...VALID, quantity: 99 })
    const line = controller.getState().lines[0]
    expect(line.quantity).toBe(99)
  })

  it('setQuantity removes a line at zero and clamps to the max', () => {
    const { controller } = makeController()
    controller.add({ ...VALID, quantity: 1 })
    controller.setQuantity('p1', 0)
    expect(controller.getState().lines).toHaveLength(0)

    controller.add({ ...VALID, quantity: 1 })
    controller.setQuantity('p1', 1000)
    expect(controller.getState().lines[0].quantity).toBe(99)

    controller.setQuantity('p1', Number.NaN)
    expect(controller.getState().lines).toHaveLength(0)
  })

  it('notifies subscribers on commits and allows unsubscribing', () => {
    const { controller } = makeController()
    let calls = 0
    const unsubscribe = controller.subscribe(() => { calls += 1 })
    controller.add(VALID)
    unsubscribe()
    controller.add({ ...VALID, quantity: 1 })
    expect(calls).toBe(1)
  })

  it('computes totals with a shipping charge', () => {
    const { controller } = makeController()
    controller.add(VALID)
    const totals = controller.getTotals(450000)
    expect(totals.subtotalRials).toBe(28500000 * 2)
    expect(totals.totalRials).toBe(28500000 * 2 + 450000)
    expect(totals.itemCount).toBe(2)
    expect(totals.lineCount).toBe(1)
  })
})