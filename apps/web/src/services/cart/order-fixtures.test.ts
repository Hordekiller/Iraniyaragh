import { describe, expect, it } from 'vitest'
import { LocalOrderStore, OrderApiError, OrderFixture } from './order-fixtures'
import type { CreateOrderInput, StoreOrder } from './types'

const VALID_ORDER: CreateOrderInput = {
  idempotencyKey: 'checkout-abc',
  items: [
    {
      productId: 'p1',
      slug: 'ronix-2210-hammer-drill',
      name: 'دریل رونیکس ۲۲۱۰',
      image: '/images/hero1.jpg',
      unitPrice: { amount: '28500000', currency: 'IRR' },
      quantity: 2,
    },
  ],
  shippingRials: 450000,
  subtotalRials: 57000000,
  totalRials: 57450000,
  shipping: {
    fullName: 'علی رضایی',
    mobile: '۰۹۱۲۰۰۰۰۰۰۰',
    province: 'تهران',
    city: 'تهران',
    postalCode: '1234567890',
    address: 'خیابان امام خمینی، کوچه ۵، پلاک ۴۲',
  },
  note: '  سفارش فوری  ',
}

describe('LocalOrderStore', () => {
  it('round-trips parsed order history and ignores malformed JSON', () => {
    const key = `order-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(key, 'bad-json{{{')
    expect(new LocalOrderStore(key).read()).toEqual([])

    const order: StoreOrder = {
      id: 'IR-0001-1',
      createdAt: '2026-09-14T10:30:00.000Z',
      status: 'PAID',
      items: VALID_ORDER.items,
      shippingRials: 0,
      subtotalRials: VALID_ORDER.subtotalRials,
      totalRials: VALID_ORDER.subtotalRials,
      shipping: VALID_ORDER.shipping,
    }
    const store = new LocalOrderStore(key)
    store.write([order])
    expect(store.read()[0].id).toBe('IR-0001-1')
  })

  it('drops non-object entries without an id', () => {
    const key = `order-${Math.random().toString(36).slice(2)}`
    window.localStorage.setItem(key, JSON.stringify([{ noId: true }, null, 1]))
    expect(new LocalOrderStore(key).read()).toEqual([])
  })
})

describe('OrderFixture', () => {
  it('creates, lists, gets and marks an order paid idempotently', async () => {
    const fixture = new OrderFixture(new LocalOrderStore(`fx-${Math.random().toString(36).slice(2)}`))

    const created = await fixture.createOrder(VALID_ORDER)
    expect(created.id).toMatch(/^IR-0001-\d+$/)
    expect(created.status).toBe('PENDING_PAYMENT')
    expect(created.shipping.mobile).toBe('09120000000')
    expect(created.note).toBe('سفارش فوری')

    const replayed = await fixture.createOrder(VALID_ORDER)
    expect(replayed.id).toBe(created.id)

    const listed = await fixture.listOrders()
    expect(listed).toHaveLength(1)

    const fetched = await fixture.getOrder(created.id)
    expect(fetched.id).toBe(created.id)

    const paid = await fixture.markPaid(created.id)
    expect(paid.status).toBe('PAID')
    expect((await fixture.getOrder(created.id)).status).toBe('PAID')
  })

  it('seeds its counter from persisted history', async () => {
    const store = new LocalOrderStore(`seed-${Math.random().toString(36).slice(2)}`)
    const existing: StoreOrder = {
      id: 'IR-0042-9',
      createdAt: '2026-01-01T00:00:00.000Z',
      status: 'PAID',
      items: [],
      shippingRials: 0,
      subtotalRials: 0,
      totalRials: 0,
      shipping: VALID_ORDER.shipping,
    }
    store.write([existing])
    const fixture = new OrderFixture(store)
    const created = await fixture.createOrder(VALID_ORDER)
    expect(created.id).toMatch(/^IR-0043-\d+$/)
  })

  it('throws validation errors for invalid orders', async () => {
    const fixture = new OrderFixture(new LocalOrderStore(`bad-${Math.random().toString(36).slice(2)}`))

    await expect(fixture.createOrder({ ...VALID_ORDER, items: [] })).rejects.toBeInstanceOf(OrderApiError)
    await expect(fixture.createOrder({ ...VALID_ORDER, subtotalRials: 1 })).rejects.toBeInstanceOf(OrderApiError)
    await expect(fixture.createOrder({ ...VALID_ORDER, shipping: { ...VALID_ORDER.shipping, province: 'نامعلوم' } })).rejects.toBeInstanceOf(OrderApiError)
    await expect(fixture.createOrder({ ...VALID_ORDER, shipping: { ...VALID_ORDER.shipping, address: 'کوتاه' } })).rejects.toBeInstanceOf(OrderApiError)
  })

  it('returns NOT_FOUND for unknown ids', async () => {
    const fixture = new OrderFixture(new LocalOrderStore(`nf-${Math.random().toString(36).slice(2)}`))
    await expect(fixture.getOrder('IR-9999-1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(fixture.markPaid('IR-9999-1')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects marking an already-paid order with a state conflict', async () => {
    const fixture = new OrderFixture(new LocalOrderStore(`st-${Math.random().toString(36).slice(2)}`))
    const order = await fixture.createOrder(VALID_ORDER)
    await fixture.markPaid(order.id)
    await expect(fixture.markPaid(order.id)).rejects.toMatchObject({ code: 'PAYMENT_STATE_CONFLICT' })
  })
})