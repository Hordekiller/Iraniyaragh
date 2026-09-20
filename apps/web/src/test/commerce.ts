import type {
  CartView,
  CheckoutOrder,
  OrderDetail,
  OrderSummary,
} from '@iranyaragh/contracts'
import { vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { LocalRefreshCoordinator } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import type { CommerceApi } from '../services/commerce/types'

export function signedInStore() {
  const store = new MemorySessionStore()
  const now = new Date().toISOString()
  store.setAuthenticated({
    accessToken: 'test-access-token',
    tokenType: 'Bearer',
    expiresInSeconds: 600,
    principal: {
      userId: 'customer-1',
      sessionId: 'session-1',
      authenticationLevel: 'CUSTOMER_OTP',
      permissions: [],
      authenticatedAt: now,
      accessExpiresAt: now,
    },
  })
  return store
}

export function testAuthProps(store = signedInStore()) {
  return {
    api: new AuthFixtureClient({ store }),
    store,
    refreshCoordinator: new LocalRefreshCoordinator(),
  }
}

export const CART: CartView = {
  id: 'cart-1',
  version: 2,
  lines: [
    {
      variantId: 'variant-1',
      quantity: 2,
      title: 'دریل رونیکس ۲۲۱۰',
      sku: 'SKU-1',
      unitPrice: { amount: '28500000', currency: 'IRR' },
      lineTotal: { amount: '57000000', currency: 'IRR' },
      available: 5,
    },
  ],
  quote: {
    subtotal: { amount: '57000000', currency: 'IRR' },
    shipping: { amount: '0', currency: 'IRR' },
    total: { amount: '57000000', currency: 'IRR' },
    currency: 'IRR',
    pricePolicyRevision: 'catalog-v1',
    quotedAt: '2026-09-19T10:00:00.000Z',
  },
  updatedAt: '2026-09-19T10:00:00.000Z',
}

export const ORDER: OrderDetail = {
  id: 'order-1',
  number: 'IR-0001',
  status: 'PENDING_PAYMENT',
  payment: { latestStatus: null, attemptCount: 0 },
  fulfillmentStatus: null,
  itemCount: 2,
  totals: {
    subtotal: CART.quote.subtotal,
    discount: { amount: '0', currency: 'IRR' },
    shipping: { amount: '590000', currency: 'IRR' },
    total: { amount: '57590000', currency: 'IRR' },
  },
  reservationExpiresAt: '2026-09-19T10:15:00.000Z',
  createdAt: '2026-09-19T10:00:00.000Z',
  updatedAt: '2026-09-19T10:00:00.000Z',
  address: {
    provinceCode: 'TEH',
    city: 'تهران',
    address: 'خیابان امام خمینی، پلاک ۴۲',
    postalCode: '1234567890',
    recipient: 'علی رضایی',
    mobile: '09123456789',
  },
  shippingMethod: { code: 'standard', title: 'ارسال استاندارد' },
  pricePolicyRevision: 'catalog-v1',
  shippingPolicyRevision: 'shipping-v1',
  items: [
    {
      variantId: 'variant-1',
      productTitle: 'دریل رونیکس ۲۲۱۰',
      variantTitle: null,
      sku: 'SKU-1',
      quantity: 2,
      unitPrice: CART.lines[0].unitPrice,
      lineTotal: CART.lines[0].lineTotal,
    },
  ],
  payments: [],
  fulfillment: null,
  timeline: [
    {
      domain: 'ORDER',
      from: 'DRAFT',
      to: 'PENDING_PAYMENT',
      createdAt: '2026-09-19T10:00:00.000Z',
    },
  ],
  truncation: { items: false, payments: false, timeline: false },
}

export function summary(order: OrderDetail = ORDER): OrderSummary {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    payment: order.payment,
    fulfillmentStatus: order.fulfillmentStatus,
    itemCount: order.itemCount,
    totals: order.totals,
    reservationExpiresAt: order.reservationExpiresAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  }
}

export function commerceStub(
  overrides: Partial<CommerceApi> = {},
): CommerceApi {
  const preview: Awaited<ReturnType<CommerceApi['previewCheckout']>> = {
    cart: CART,
    shipping: [
      {
        quoteId: 'quote-1',
        method: 'standard',
        title: 'ارسال استاندارد',
        amount: { amount: '590000', currency: 'IRR' },
        policyRevision: 'shipping-v1',
        pricePolicyRevision: 'catalog-v1',
        cartVersion: CART.version,
        expiresAt: '2099-09-19T10:15:00.000Z',
      },
    ],
  }
  const checkoutOrder: CheckoutOrder = {
    id: ORDER.id,
    number: ORDER.number,
    status: 'PENDING_PAYMENT',
    items: ORDER.items,
    subtotal: ORDER.totals.subtotal,
    discount: ORDER.totals.discount,
    shipping: ORDER.totals.shipping,
    total: ORDER.totals.total,
    address: ORDER.address!,
    shippingQuote: preview.shipping[0],
    pricePolicyRevision: 'catalog-v1',
    reservationExpiresAt: ORDER.reservationExpiresAt,
    createdAt: ORDER.createdAt,
  }
  return {
    getCart: vi.fn(async () => CART),
    addLine: vi.fn(async () => CART),
    setLine: vi.fn(async () => CART),
    removeLine: vi.fn(async () => ({ ...CART, lines: [] })),
    mergeGuestCart: vi.fn(async () => ({ cart: CART, warnings: [] })),
    previewCheckout: vi.fn(async () => preview),
    createCheckout: vi.fn(async () => checkoutOrder),
    listOrders: vi.fn(async () => ({
      items: [summary()],
      meta: { page: 1, perPage: 25, total: 1, pages: 1 },
    })),
    getOrder: vi.fn(async () => ORDER),
    ...overrides,
  }
}
