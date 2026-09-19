import type { CheckoutAddress } from '@iranyaragh/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommerceFixtureClient } from './fixture'
import type { CommerceApi } from './types'

const ADDRESS: CheckoutAddress = {
  provinceCode: 'TEH',
  city: 'تهران',
  address: 'خیابان امام خمینی، پلاک ۴۲',
  postalCode: '1234567890',
  recipient: 'علی رضایی',
  mobile: '09123456789',
}

const SELLABLE_VARIANT = 'variant-p-101'
const SECOND_SELLABLE_VARIANT = 'variant-p-102'
const OUT_OF_STOCK_VARIANT = 'variant-p-105'

function expectApiFailure(
  promise: Promise<unknown>,
  code: string,
  statusCode: number,
) {
  return expect(promise).rejects.toMatchObject({
    code,
    statusCode,
  })
}

describe('CommerceFixtureClient', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts empty and returns isolated cart snapshots', async () => {
    const client: CommerceApi = new CommerceFixtureClient()

    const first = await client.getCart()
    first.lines.push({
      variantId: 'external-mutation',
      quantity: 1,
      title: 'نباید ذخیره شود',
      sku: 'EXTERNAL',
      unitPrice: { amount: '1', currency: 'IRR' },
      lineTotal: { amount: '1', currency: 'IRR' },
      available: 1,
    })

    await expect(client.getCart()).resolves.toMatchObject({
      id: null,
      version: 0,
      lines: [],
    })
    await expect(client.listOrders()).resolves.toMatchObject({
      items: [],
      meta: { page: 1, perPage: 25, total: 0, pages: 0 },
    })
  })

  it('maintains quantities and server-derived totals while enforcing the fixture stock rules', async () => {
    const client: CommerceApi = new CommerceFixtureClient()

    const added = await client.addLine(SELLABLE_VARIANT, 2, 'add-1')
    expect(added).toMatchObject({
      id: 'fixture-cart',
      version: 1,
      lines: [{ variantId: SELLABLE_VARIANT, quantity: 2 }],
      quote: {
        subtotal: { amount: '57000000', currency: 'IRR' },
        total: { amount: '57000000', currency: 'IRR' },
      },
    })

    const incremented = await client.addLine(SELLABLE_VARIANT, 1, 'add-2')
    expect(incremented.lines[0]?.quantity).toBe(3)

    const capped = await client.setLine(SELLABLE_VARIANT, 200, 'set-1')
    expect(capped.lines[0]?.quantity).toBe(99)

    const withSecondLine = await client.addLine(
      SECOND_SELLABLE_VARIANT,
      1,
      'add-3',
    )
    expect(withSecondLine.lines).toHaveLength(2)

    const removed = await client.removeLine(SECOND_SELLABLE_VARIANT, 'remove-1')
    expect(removed.lines.map((line) => line.variantId)).toEqual([
      SELLABLE_VARIANT,
    ])

    const emptied = await client.setLine(SELLABLE_VARIANT, 0, 'set-2')
    expect(emptied).toMatchObject({
      id: null,
      lines: [],
      quote: { total: { amount: '0', currency: 'IRR' } },
    })

    await expectApiFailure(
      client.addLine('variant-does-not-exist', 1, 'missing'),
      'SKU_NOT_FOUND',
      404,
    )
    await expectApiFailure(
      client.addLine(OUT_OF_STOCK_VARIANT, 1, 'unavailable'),
      'CART_QUANTITY_INVALID',
      422,
    )
  })

  it('rejects checkout without a cart or a matching live shipping quote', async () => {
    const client: CommerceApi = new CommerceFixtureClient()

    await expectApiFailure(
      client.previewCheckout(ADDRESS),
      'CART_EMPTY',
      422,
    )
    await client.addLine(SELLABLE_VARIANT, 1, 'add-1')
    await expectApiFailure(
      client.createCheckout(ADDRESS, 'unknown-quote', 'checkout-1'),
      'CONFLICT',
      409,
    )

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00.000Z'))
    const preview = await client.previewCheckout(ADDRESS)
    vi.advanceTimersByTime(15 * 60_000 + 1)

    await expectApiFailure(
      client.createCheckout(
        ADDRESS,
        preview.shipping[0].quoteId,
        'checkout-2',
      ),
      'CONFLICT',
      409,
    )
  })

  it('creates a pending-payment order from the quoted cart and exposes customer order views', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T10:00:00.000Z'))
    const client: CommerceApi = new CommerceFixtureClient()
    await client.addLine(SELLABLE_VARIANT, 2, 'add-1')

    const preview = await client.previewCheckout(ADDRESS)
    expect(preview).toMatchObject({
      cart: {
        quote: {
          shipping: { amount: '590000', currency: 'IRR' },
          total: { amount: '57590000', currency: 'IRR' },
        },
      },
      shipping: [
        {
          method: 'fixture-standard',
          amount: { amount: '590000', currency: 'IRR' },
          cartVersion: 1,
        },
      ],
    })

    const order = await client.createCheckout(
      ADDRESS,
      preview.shipping[0].quoteId,
      'checkout-1',
    )
    expect(order).toMatchObject({
      id: 'fixture-order-1',
      number: 'DEV-00001',
      status: 'PENDING_PAYMENT',
      address: ADDRESS,
      total: { amount: '57590000', currency: 'IRR' },
      items: [{ variantId: SELLABLE_VARIANT, quantity: 2 }],
    })
    await expect(client.getCart()).resolves.toMatchObject({ id: null, lines: [] })

    const orders = await client.listOrders()
    expect(orders).toMatchObject({
      meta: { page: 1, perPage: 25, total: 1, pages: 1 },
      items: [
        {
          id: order.id,
          status: 'PENDING_PAYMENT',
          payment: { latestStatus: null, attemptCount: 0 },
          itemCount: 2,
        },
      ],
    })

    const detail = await client.getOrder(order.id)
    expect(detail).toMatchObject({
      id: order.id,
      shippingMethod: {
        code: 'fixture-standard',
        title: 'ارسال استاندارد (محیط توسعه)',
      },
      timeline: [{ from: 'DRAFT', to: 'PENDING_PAYMENT' }],
      truncation: { items: false, payments: false, timeline: false },
    })
    detail.items.length = 0
    await expect(client.getOrder(order.id)).resolves.toMatchObject({
      items: [{ variantId: SELLABLE_VARIANT }],
    })
    await expectApiFailure(client.getOrder('missing-order'), 'NOT_FOUND', 404)
  })
})
