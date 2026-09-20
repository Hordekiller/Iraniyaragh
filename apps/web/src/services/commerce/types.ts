import type {
  CartMergeResponse,
  CartView,
  CheckoutAddress,
  CheckoutOrder,
  CheckoutPreviewResponse,
  CustomerOrderListResponse,
  OrderDetail,
} from '@iranyaragh/contracts'

export type CheckoutPreview = CheckoutPreviewResponse['data']
export type CustomerOrderPage = CustomerOrderListResponse['data']
export type CartMergeResult = CartMergeResponse['data']
export type CartOwner = 'guest' | 'customer'

export interface CommerceApi {
  getCart(owner: CartOwner): Promise<CartView>
  addLine(
    owner: CartOwner,
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<CartView>
  setLine(
    owner: CartOwner,
    variantId: string,
    quantity: number,
    idempotencyKey: string,
  ): Promise<CartView>
  removeLine(
    owner: CartOwner,
    variantId: string,
    idempotencyKey: string,
  ): Promise<CartView>
  mergeGuestCart(idempotencyKey: string): Promise<CartMergeResult>
  previewCheckout(address: CheckoutAddress): Promise<CheckoutPreview>
  createCheckout(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOrder>
  listOrders(page?: number): Promise<CustomerOrderPage>
  getOrder(id: string): Promise<OrderDetail>
}

export type CartPhase = 'idle' | 'loading' | 'ready' | 'merging' | 'error'

export type CommerceCartState = {
  cart: CartView
  phase: CartPhase
  owner: CartOwner
  error: unknown | null
  mergeWarnings: CartMergeResult['warnings']
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
