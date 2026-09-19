import type {
  CartView,
  CheckoutAddress,
  CheckoutOrder,
  CheckoutPreviewResponse,
  CustomerOrderListResponse,
  OrderDetail,
} from '@iranyaragh/contracts'

export type CheckoutPreview = CheckoutPreviewResponse['data']
export type CustomerOrderPage = CustomerOrderListResponse['data']

export interface CommerceApi {
  getCart(): Promise<CartView>
  addLine(
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<CartView>
  setLine(
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<CartView>
  removeLine(variantId: string, idempotencyKey: string): Promise<CartView>
  previewCheckout(address: CheckoutAddress): Promise<CheckoutPreview>
  createCheckout(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOrder>
  listOrders(page?: number): Promise<CustomerOrderPage>
  getOrder(id: string): Promise<OrderDetail>
}

export type CartPhase = 'anonymous' | 'loading' | 'ready' | 'error'

export type CommerceCartState = {
  cart: CartView
  phase: CartPhase
  error: unknown | null
  pendingVariantIds: string[]
}

export const EMPTY_CART: CartView = {
  id: null,
  version: 0,
  lines: [],
  quote: {
    subtotal: { amount: '0', currency: 'IRR' },
    shipping: { amount: '0', currency: 'IRR' },
    total: { amount: '0', currency: 'IRR' },
    currency: 'IRR',
    pricePolicyRevision: 'unquoted',
    quotedAt: new Date(0).toISOString(),
  },
  updatedAt: null,
}
