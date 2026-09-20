import type {
  CartMergeResponse,
  CartResponse,
  CheckoutAddress,
  CheckoutPreviewResponse,
  CheckoutResponse,
  CustomerOrderDetailResponse,
  CustomerOrderListResponse,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { jsonRequest } from '../../lib/auth/request'
import type { RequestOptions } from '../../lib/auth/request'
import { readGuestCartCsrfCookie } from '../cart/guest-session'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'
import type { ApiSuccess } from '../../lib/auth/types'
import type { CartOwner, CommerceApi } from './types'

type PublicJsonRequest = <T>(
  path: string,
  options?: RequestOptions,
) => Promise<ApiSuccess<T>>

export class CommerceHttpClient implements CommerceApi {
  constructor(
    private readonly request: AuthenticatedJsonRequest,
    private readonly baseUrl = '',
    private readonly documentSource: Pick<
      Document,
      'cookie'
    > | null = globalThis.document ?? null,
    private readonly publicRequest: PublicJsonRequest = jsonRequest,
  ) {}

  async getCart(owner: CartOwner) {
    const response = await this.cartRequest<CartResponse['data']>(
      owner,
      this.cartPath(owner),
    )
    return response.data.cart
  }

  async addLine(
    owner: CartOwner,
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ) {
    const response = await this.cartMutation(
      owner,
      `${this.cartPath(owner)}/lines`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { variantId, quantity },
      },
    )
    return response.data.cart
  }

  async setLine(
    owner: CartOwner,
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ) {
    const response = await this.cartMutation(
      owner,
      `${this.cartPath(owner)}/lines/${encodeURIComponent(variantId)}`,
      {
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { variantId, quantity },
      },
    )
    return response.data.cart
  }

  async removeLine(
    owner: CartOwner,
    variantId: string,
    idempotencyKey: string,
  ) {
    const response = await this.cartMutation(
      owner,
      `${this.cartPath(owner)}/lines/${encodeURIComponent(variantId)}`,
      {
        method: 'DELETE',
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    )
    return response.data.cart
  }

  async mergeGuestCart(idempotencyKey: string) {
    const csrfToken = this.readGuestCsrf()
    const response = await this.request<CartMergeResponse['data']>(
      '/api/v1/cart/merge-guest',
      {
        baseUrl: this.baseUrl,
        method: 'POST',
        credentials: 'include',
        headers: {
          'Idempotency-Key': idempotencyKey,
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
      },
    )
    return response.data
  }

  async previewCheckout(address: CheckoutAddress) {
    const response = await this.request<CheckoutPreviewResponse['data']>(
      '/api/v1/checkout/preview',
      {
        baseUrl: this.baseUrl,
        method: 'POST',
        credentials: 'include',
        json: { address },
      },
    )
    return response.data
  }

  async createCheckout(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ) {
    const response = await this.request<CheckoutResponse['data']>(
      '/api/v1/checkout',
      {
        baseUrl: this.baseUrl,
        method: 'POST',
        credentials: 'include',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { address, shippingQuoteId },
      },
    )
    return response.data.order
  }

  async listOrders(page = 1) {
    const response = await this.request<CustomerOrderListResponse['data']>(
      `/api/v1/orders?page=${page}&perPage=25&sortDir=desc`,
      { baseUrl: this.baseUrl, credentials: 'include' },
    )
    return response.data
  }

  async getOrder(id: string) {
    const response = await this.request<CustomerOrderDetailResponse['data']>(
      `/api/v1/orders/${encodeURIComponent(id)}`,
      { baseUrl: this.baseUrl, credentials: 'include' },
    )
    return response.data.order
  }

  private cartPath(owner: CartOwner): '/api/v1/cart' | '/api/v1/guest-cart' {
    return owner === 'customer' ? '/api/v1/cart' : '/api/v1/guest-cart'
  }

  private cartRequest<T>(owner: CartOwner, path: string) {
    const options = { baseUrl: this.baseUrl, credentials: 'include' as const }
    return owner === 'customer'
      ? this.request<T>(path, options)
      : this.publicRequest<T>(path, options)
  }

  private async cartMutation(
    owner: CartOwner,
    path: string,
    options: RequestOptions,
  ): Promise<ApiSuccess<CartResponse['data']>> {
    if (owner === 'customer') {
      return this.request<CartResponse['data']>(path, {
        ...options,
        baseUrl: this.baseUrl,
        credentials: 'include',
      })
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const csrfToken = await this.ensureGuestSession()
      try {
        return await this.publicRequest<CartResponse['data']>(path, {
          ...options,
          baseUrl: this.baseUrl,
          credentials: 'include',
          headers: {
            ...options.headers,
            'X-CSRF-Token': csrfToken,
          },
        })
      } catch (error) {
        if (attempt === 0 && isGuestProofFailure(error)) continue
        throw error
      }
    }
    throw new Error('Unreachable Guest Cart mutation state.')
  }

  private async ensureGuestSession(): Promise<string> {
    const existing = this.readGuestCsrf()
    if (existing) return existing
    await this.publicRequest<void>('/api/v1/guest-cart/session', {
      baseUrl: this.baseUrl,
      method: 'POST',
      credentials: 'include',
      allowNoContent: true,
    })
    const issued = this.readGuestCsrf()
    if (issued) return issued
    throw new AuthApiError({
      code: 'AUTH_CSRF_INVALID',
      message: 'Guest Cart session cookie is unavailable.',
      statusCode: 403,
    })
  }

  private readGuestCsrf(): string | null {
    return this.documentSource
      ? readGuestCartCsrfCookie(this.documentSource)
      : null
  }
}

function isGuestProofFailure(error: unknown): boolean {
  return error instanceof AuthApiError && error.code === 'AUTH_CSRF_INVALID'
}
