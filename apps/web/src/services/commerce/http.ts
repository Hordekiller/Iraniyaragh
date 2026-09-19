import type {
  CartResponse,
  CheckoutAddress,
  CheckoutPreviewResponse,
  CheckoutResponse,
  CustomerOrderDetailResponse,
  CustomerOrderListResponse,
} from '@iranyaragh/contracts'
import type { AuthenticatedJsonRequest } from '../../state/auth-context'
import type { CommerceApi } from './types'

export class CommerceHttpClient implements CommerceApi {
  constructor(
    private readonly request: AuthenticatedJsonRequest,
    private readonly baseUrl = '',
  ) {}

  async getCart() {
    const response = await this.request<CartResponse['data']>('/api/v1/cart', {
      baseUrl: this.baseUrl,
    })
    return response.data.cart
  }

  async addLine(variantId: string, quantity: number, idempotencyKey: string) {
    const response = await this.request<CartResponse['data']>(
      '/api/v1/cart/lines',
      {
        baseUrl: this.baseUrl,
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { variantId, quantity },
      },
    )
    return response.data.cart
  }

  async setLine(variantId: string, quantity: number, idempotencyKey: string) {
    const response = await this.request<CartResponse['data']>(
      `/api/v1/cart/lines/${encodeURIComponent(variantId)}`,
      {
        baseUrl: this.baseUrl,
        method: 'PUT',
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { variantId, quantity },
      },
    )
    return response.data.cart
  }

  async removeLine(variantId: string, idempotencyKey: string) {
    const response = await this.request<CartResponse['data']>(
      `/api/v1/cart/lines/${encodeURIComponent(variantId)}`,
      {
        baseUrl: this.baseUrl,
        method: 'DELETE',
        headers: { 'Idempotency-Key': idempotencyKey },
      },
    )
    return response.data.cart
  }

  async previewCheckout(address: CheckoutAddress) {
    const response = await this.request<CheckoutPreviewResponse['data']>(
      '/api/v1/checkout/preview',
      { baseUrl: this.baseUrl, method: 'POST', json: { address } },
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
        headers: { 'Idempotency-Key': idempotencyKey },
        json: { address, shippingQuoteId },
      },
    )
    return response.data.order
  }

  async listOrders(page = 1) {
    const response = await this.request<CustomerOrderListResponse['data']>(
      `/api/v1/orders?page=${page}&perPage=25&sortDir=desc`,
      { baseUrl: this.baseUrl },
    )
    return response.data
  }

  async getOrder(id: string) {
    const response = await this.request<CustomerOrderDetailResponse['data']>(
      `/api/v1/orders/${encodeURIComponent(id)}`,
      { baseUrl: this.baseUrl },
    )
    return response.data.order
  }
}
