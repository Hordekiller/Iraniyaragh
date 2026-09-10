import { describe, expect, it } from 'vitest'
import { LocalOrderStore, OrderFixture } from './order-fixtures'
import type { CreateOrderInput, StoreOrder } from './types'

const BASE_INPUT: CreateOrderInput = {
  items: [
    {
      productId: 'p1',
      slug: 'ronix-2210-hammer-drill',
      name: 'دریل رونیکس',
      image: '/images/hero1.jpg',
      unitPrice: { amount: '28500000', currency: 'IRR' },
      quantity: 1,
    },
  ],
  shippingRials: 450000,
  subtotalRials: 28500000,
  totalRials: 28950000,
  shipping: {
    fullName: 'علی',
    mobile: '+989120000000',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام',
  },
}

class FakeLocalStore {
  private orders: StoreOrder[] = []
  read(): StoreOrder[] {
    return this.orders.map(o => ({ ...o }))
  }
  write(orders: StoreOrder[]): void {
    this.orders = orders.map(o => ({ ...o }))
  }
}

function storedOrder(id: string): StoreOrder {
  return {
    ...BASE_INPUT,
    id,
    createdAt: new Date().toISOString(),
    status: 'PENDING_PAYMENT',
    items: BASE_INPUT.items.map(it => ({ ...it })),
    shipping: { ...BASE_INPUT.shipping },
  }
}

describe('OrderFixture', () => {
  it('numbers order ids sequentially, avoiding duplicates across reloads', async () => {
    const store = new FakeLocalStore()
    const first = new OrderFixture(store)
    const one = await first.createOrder(BASE_INPUT)
    const two = await first.createOrder(BASE_INPUT)

    expect(one.id).toMatch(/^IR-\d{4}-\d+$/)
    expect(two.id).not.toBe(one.id)

    const reloaded = new OrderFixture(store)
    const third = await reloaded.createOrder(BASE_INPUT)

    expect(third.id).not.toBe(one.id)
    expect(third.id).not.toBe(two.id)
  })

  it('continues the sequence past existing stored orders', async () => {
    const store = new FakeLocalStore()
    store.write([storedOrder('IR-0007-111')])

    const reloaded = new OrderFixture(store)
    const next = await reloaded.createOrder(BASE_INPUT)

    expect(next.id).not.toBe('IR-0007-111')
    expect(Number(next.id.slice(3, 7))).toBeGreaterThan(7)
  })

  it('starts at the highest sequence found across stored orders', async () => {
    const store = new FakeLocalStore()
    store.write([storedOrder('IR-0012-999'), storedOrder('IR-0003-42')])

    const reloaded = new OrderFixture(store)
    const next = await reloaded.createOrder(BASE_INPUT)

    expect(Number(next.id.slice(3, 7))).toBe(13)
  })

  it('keeps order history across reloads via LocalOrderStore', async () => {
    const key = 'iranyaragh.orders.v1.test'
    const store = new LocalOrderStore(key)
    try {
      const first = new OrderFixture(store)
      const created = await first.createOrder(BASE_INPUT)
      expect((await first.listOrders()).length).toBe(1)

      const reloaded = new OrderFixture(store)
      expect((await reloaded.listOrders()).length).toBe(1)
      const next = await reloaded.createOrder(BASE_INPUT)
      expect(next.id).not.toBe(created.id)
    } finally {
      localStorage.removeItem(key)
    }
  })

  it('returns the existing order for a repeated idempotency key', async () => {
    const store = new FakeLocalStore()
    const fixture = new OrderFixture(store)
    const first = await fixture.createOrder({ ...BASE_INPUT, idempotencyKey: 'checkout-1' })
    const repeated = await fixture.createOrder({ ...BASE_INPUT, idempotencyKey: 'checkout-1' })

    expect(repeated.id).toBe(first.id)
    expect((await fixture.listOrders()).length).toBe(1)
  })

  it('rejects manipulated totals and invalid Iranian shipping data', async () => {
    const fixture = new OrderFixture(new FakeLocalStore())

    await expect(fixture.createOrder({ ...BASE_INPUT, totalRials: 1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
    await expect(fixture.createOrder({ ...BASE_INPUT, shipping: { ...BASE_INPUT.shipping, mobile: '123' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})
