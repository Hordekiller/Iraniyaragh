import type { CheckoutAddress } from '@iranyaragh/contracts'
import { describe, expect, it, vi } from 'vitest'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'
import { CART, ORDER, summary } from '../../test/commerce'
import { CommerceHttpClient } from './http'

const ADDRESS: CheckoutAddress = {
  provinceCode: 'TEH',
  city: 'تهران',
  address: 'خیابان امام خمینی، پلاک ۴۲',
  postalCode: '1234567890',
  recipient: 'علی رضایی',
  mobile: '09123456789',
}

function requestStub() {
  return vi.fn(
    async (path: string, options?: Parameters<AuthenticatedJsonRequest>[1]) => {
      void options
      if (path === '/api/v1/checkout/preview') {
        return { data: { cart: CART, shipping: [] } }
      }
      if (path === '/api/v1/checkout') return { data: { order: ORDER } }
      if (path.startsWith('/api/v1/orders?')) {
        return {
          data: {
            items: [summary()],
            meta: { page: 1, perPage: 25, total: 1, pages: 1 },
          },
        }
      }
      if (path.startsWith('/api/v1/orders/')) return { data: { order: ORDER } }
      return { data: { cart: CART } }
    },
  )
}

describe('CommerceHttpClient', () => {
  it('uses the authenticated cart routes and preserves mutation idempotency keys', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '/backend',
    )

    await client.getCart()
    await client.addLine('variant/1', 2, 'add-key')
    await client.setLine('variant/1', 3, 'set-key')
    await client.removeLine('variant/1', 'remove-key')

    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/cart', {
      baseUrl: '/backend',
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/cart/lines', {
      baseUrl: '/backend',
      method: 'POST',
      headers: { 'Idempotency-Key': 'add-key' },
      json: { variantId: 'variant/1', quantity: 2 },
    })
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/v1/cart/lines/variant%2F1',
      {
        baseUrl: '/backend',
        method: 'PUT',
        headers: { 'Idempotency-Key': 'set-key' },
        json: { variantId: 'variant/1', quantity: 3 },
      },
    )
    expect(request).toHaveBeenNthCalledWith(
      4,
      '/api/v1/cart/lines/variant%2F1',
      {
        baseUrl: '/backend',
        method: 'DELETE',
        headers: { 'Idempotency-Key': 'remove-key' },
      },
    )
  })

  it('sends only address and the selected server quote to checkout', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
    )

    await client.previewCheckout(ADDRESS)
    await client.createCheckout(ADDRESS, 'quote-1', 'checkout-key')

    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/checkout/preview', {
      baseUrl: '',
      method: 'POST',
      json: { address: ADDRESS },
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/checkout', {
      baseUrl: '',
      method: 'POST',
      headers: { 'Idempotency-Key': 'checkout-key' },
      json: { address: ADDRESS, shippingQuoteId: 'quote-1' },
    })
    expect(request.mock.calls[1]?.[1]?.json).not.toHaveProperty('total')
    expect(request.mock.calls[1]?.[1]?.json).not.toHaveProperty('items')
  })

  it('loads only customer-scoped order routes and encodes identifiers', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
    )

    await expect(client.listOrders()).resolves.toMatchObject({
      items: [{ id: ORDER.id }],
    })
    await expect(client.getOrder('order/1')).resolves.toMatchObject({
      id: ORDER.id,
    })

    expect(request).toHaveBeenNthCalledWith(
      1,
      '/api/v1/orders?page=1&perPage=25&sortDir=desc',
      { baseUrl: '' },
    )
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/orders/order%2F1', {
      baseUrl: '',
    })
  })
})
