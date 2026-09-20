import type { CheckoutAddress } from '@iranyaragh/contracts'
import { describe, expect, it, vi } from 'vitest'
import { AuthApiError } from '../../lib/auth/errors'
import type { RequestOptions } from '../../lib/auth/request'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'
import { CART, ORDER, summary } from '../../test/commerce'
import { CommerceHttpClient } from './http'

type PublicRequest = NonNullable<
  ConstructorParameters<typeof CommerceHttpClient>[3]
>

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
      if (path === '/api/v1/cart/merge-guest') {
        return { data: { cart: CART, warnings: [] } }
      }
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
  it('uses authenticated Cart routes with credentials and idempotency keys', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '/backend',
    )

    await client.getCart('customer')
    await client.addLine('customer', 'variant/1', 2, 'add-key')
    await client.setLine('customer', 'variant/1', 3, 'set-key')
    await client.removeLine('customer', 'variant/1', 'remove-key')

    expect(request).toHaveBeenNthCalledWith(1, '/api/v1/cart', {
      baseUrl: '/backend',
      credentials: 'include',
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/cart/lines', {
      baseUrl: '/backend',
      credentials: 'include',
      method: 'POST',
      headers: { 'Idempotency-Key': 'add-key' },
      json: { variantId: 'variant/1', quantity: 2 },
    })
    expect(request).toHaveBeenNthCalledWith(
      3,
      '/api/v1/cart/lines/variant%2F1',
      {
        baseUrl: '/backend',
        credentials: 'include',
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
        credentials: 'include',
        method: 'DELETE',
        headers: { 'Idempotency-Key': 'remove-key' },
      },
    )
  })

  it('establishes a Guest session only before the first mutation', async () => {
    const request = requestStub()
    const cookieDocument = { cookie: '' }
    const publicRequest = vi.fn(async (path: string) => {
      if (path === '/api/v1/guest-cart/session') {
        cookieDocument.cookie = 'iranyaragh_guest_csrf=guest-csrf'
        return { data: undefined }
      }
      return { data: { cart: CART } }
    })
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '/backend',
      cookieDocument,
      publicRequest as unknown as PublicRequest,
    )

    await client.getCart('guest')
    await client.addLine('guest', 'variant-1', 1, 'guest-add-key')
    await client.setLine('guest', 'variant-1', 2, 'guest-set-key')

    expect(publicRequest).toHaveBeenNthCalledWith(1, '/api/v1/guest-cart', {
      baseUrl: '/backend',
      credentials: 'include',
    })
    expect(publicRequest).toHaveBeenNthCalledWith(
      2,
      '/api/v1/guest-cart/session',
      {
        baseUrl: '/backend',
        method: 'POST',
        credentials: 'include',
        allowNoContent: true,
      },
    )
    expect(publicRequest).toHaveBeenNthCalledWith(
      3,
      '/api/v1/guest-cart/lines',
      {
        baseUrl: '/backend',
        method: 'POST',
        credentials: 'include',
        headers: {
          'Idempotency-Key': 'guest-add-key',
          'X-CSRF-Token': 'guest-csrf',
        },
        json: { variantId: 'variant-1', quantity: 1 },
      },
    )
    expect(publicRequest).toHaveBeenNthCalledWith(
      4,
      '/api/v1/guest-cart/lines/variant-1',
      expect.objectContaining({
        headers: {
          'Idempotency-Key': 'guest-set-key',
          'X-CSRF-Token': 'guest-csrf',
        },
      }),
    )
    expect(
      publicRequest.mock.calls.filter(
        ([path]) => path === '/api/v1/guest-cart/session',
      ),
    ).toHaveLength(1)
    expect(request).not.toHaveBeenCalled()
  })

  it('single-flights concurrent first-mutation Guest session bootstrap', async () => {
    const request = requestStub()
    const cookieDocument = { cookie: '' }
    let finishSession: (() => void) | undefined
    const sessionBarrier = new Promise<void>((resolve) => {
      finishSession = resolve
    })
    const publicRequest = vi.fn(
      async (path: string, options?: RequestOptions) => {
        void options
        if (path === '/api/v1/guest-cart/session') {
          await sessionBarrier
          cookieDocument.cookie = 'iranyaragh_guest_csrf=shared-csrf'
          return { data: undefined }
        }
        return { data: { cart: CART } }
      },
    )
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '',
      cookieDocument,
      publicRequest as unknown as PublicRequest,
    )

    const first = client.addLine('guest', 'variant-1', 1, 'first-key')
    const second = client.addLine('guest', 'variant-2', 1, 'second-key')
    await vi.waitFor(() =>
      expect(
        publicRequest.mock.calls.filter(
          ([path]) => path === '/api/v1/guest-cart/session',
        ),
      ).toHaveLength(1),
    )

    finishSession?.()
    await Promise.all([first, second])
    const mutationCalls = publicRequest.mock.calls.filter(([path]) =>
      path.startsWith('/api/v1/guest-cart/lines'),
    )
    expect(mutationCalls).toHaveLength(2)
    expect(mutationCalls[0]?.[1]?.headers).toMatchObject({
      'X-CSRF-Token': 'shared-csrf',
    })
    expect(mutationCalls[1]?.[1]?.headers).toMatchObject({
      'X-CSRF-Token': 'shared-csrf',
    })
  })

  it('recovers an invalid Guest proof once without changing the mutation key', async () => {
    const request = requestStub()
    const cookieDocument = { cookie: 'iranyaragh_guest_csrf=stale-csrf' }
    let mutationAttempts = 0
    const publicRequest = vi.fn(
      async (path: string, options?: RequestOptions) => {
        void options
        if (path === '/api/v1/guest-cart/session') {
          cookieDocument.cookie = 'iranyaragh_guest_csrf=fresh-csrf'
          return { data: undefined }
        }
        if (path === '/api/v1/guest-cart/lines') {
          mutationAttempts += 1
          if (mutationAttempts === 1) {
            cookieDocument.cookie = ''
            throw new AuthApiError({
              code: 'AUTH_CSRF_INVALID',
              message: 'invalid',
              statusCode: 403,
            })
          }
        }
        return { data: { cart: CART } }
      },
    )
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '',
      cookieDocument,
      publicRequest as unknown as PublicRequest,
    )

    await client.addLine('guest', 'variant-1', 1, 'stable-key')

    const mutationCalls = publicRequest.mock.calls.filter(
      ([path]) => path === '/api/v1/guest-cart/lines',
    )
    expect(mutationCalls).toHaveLength(2)
    expect(mutationCalls[0]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'stable-key',
      'X-CSRF-Token': 'stale-csrf',
    })
    expect(mutationCalls[1]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'stable-key',
      'X-CSRF-Token': 'fresh-csrf',
    })
  })

  it('fails closed when session bootstrap does not issue a readable CSRF cookie', async () => {
    const request = requestStub()
    const publicRequest = vi.fn(async () => ({ data: undefined }))
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '',
      { cookie: '' },
      publicRequest as unknown as PublicRequest,
    )

    await expect(
      client.addLine('guest', 'variant-1', 1, 'stable-key'),
    ).rejects.toMatchObject({ code: 'AUTH_CSRF_INVALID', statusCode: 403 })
    expect(publicRequest).toHaveBeenCalledOnce()
    expect(publicRequest).toHaveBeenCalledWith('/api/v1/guest-cart/session', {
      baseUrl: '',
      method: 'POST',
      credentials: 'include',
      allowNoContent: true,
    })
  })

  it('retries an invalid Guest proof at most once', async () => {
    const request = requestStub()
    const cookieDocument = { cookie: 'iranyaragh_guest_csrf=guest-csrf' }
    const failure = new AuthApiError({
      code: 'AUTH_CSRF_INVALID',
      message: 'invalid',
      statusCode: 403,
    })
    const publicRequest = vi.fn(
      async (_path: string, _options?: RequestOptions) => {
        void _path
        void _options
        throw failure
      },
    )
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '',
      cookieDocument,
      publicRequest as unknown as PublicRequest,
    )

    await expect(
      client.removeLine('guest', 'variant-1', 'stable-key'),
    ).rejects.toBe(failure)
    expect(publicRequest).toHaveBeenCalledTimes(2)
    expect(publicRequest.mock.calls[0]?.[1]?.headers).toEqual(
      publicRequest.mock.calls[1]?.[1]?.headers,
    )
  })

  it('merges with optional Guest CSRF proof and authenticated credentials', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '/backend',
      { cookie: '__Host-iranyaragh_guest_csrf=merge-csrf' },
    )

    await client.mergeGuestCart('merge-key')

    expect(request).toHaveBeenCalledWith('/api/v1/cart/merge-guest', {
      baseUrl: '/backend',
      method: 'POST',
      credentials: 'include',
      headers: {
        'Idempotency-Key': 'merge-key',
        'X-CSRF-Token': 'merge-csrf',
      },
    })
  })

  it('merges an authenticated customer without inventing Guest proof when no Guest cookie exists', async () => {
    const request = requestStub()
    const client = new CommerceHttpClient(
      request as unknown as AuthenticatedJsonRequest,
      '/backend',
      { cookie: '' },
    )

    await client.mergeGuestCart('merge-key')

    expect(request).toHaveBeenCalledWith('/api/v1/cart/merge-guest', {
      baseUrl: '/backend',
      method: 'POST',
      credentials: 'include',
      headers: { 'Idempotency-Key': 'merge-key' },
    })
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
      credentials: 'include',
      json: { address: ADDRESS },
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/checkout', {
      baseUrl: '',
      method: 'POST',
      credentials: 'include',
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
      { baseUrl: '', credentials: 'include' },
    )
    expect(request).toHaveBeenNthCalledWith(2, '/api/v1/orders/order%2F1', {
      baseUrl: '',
      credentials: 'include',
    })
  })
})
