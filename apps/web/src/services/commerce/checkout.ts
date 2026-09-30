import type {
  CartView,
  CheckoutAddress,
  CheckoutOrder,
  ShippingQuote,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { jsonRequest } from '../../lib/auth/request'
import type { MemorySessionStore } from '../../lib/auth/session-store'
import type { StoreCartApi } from './cart'
import type { OrderStore } from './order-store'
import { checkoutOrderToDetail } from './order-store'

export interface CheckoutApi {
  /** Resolve the address into a cart snapshot + the available shipping quotes. */
  preview(address: CheckoutAddress): Promise<{ cart: CartView; shipping: ShippingQuote[] }>
  /**
   * Create the order. The caller owns the idempotency key and must reuse it on
   * retries of the SAME checkout attempt (network timeouts are safe to retry).
   */
  create(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOrder>
}

export type CheckoutApiOptions = {
  store: MemorySessionStore
  fetch?: typeof fetch
  baseUrl?: string
}

function tokenFrom(store: MemorySessionStore): string {
  const token = store.getAccessToken()
  if (!token) {
    throw new AuthApiError({
      code: 'AUTH_REAUTHENTICATION_REQUIRED',
      message: 'برای ثبت سفارش ابتدا وارد شوید.',
      statusCode: 401,
    })
  }
  return token
}

/** Live checkout client against `/api/v1/checkout`. */
export class CheckoutHttpClient implements CheckoutApi {
  private readonly store: MemorySessionStore
  private readonly baseUrl: string
  private readonly fetcher?: typeof fetch

  constructor(options: CheckoutApiOptions) {
    this.store = options.store
    this.baseUrl = options.baseUrl ?? ''
    this.fetcher = options.fetch
  }

  async preview(address: CheckoutAddress): Promise<{ cart: CartView; shipping: ShippingQuote[] }> {
    const { data } = await jsonRequest<{ cart: CartView; shipping: ShippingQuote[] }>('/api/v1/checkout/preview', {
      baseUrl: this.baseUrl,
      accessToken: tokenFrom(this.store),
      method: 'POST',
      json: { address },
      fetch: this.fetcher,
    })
    return data
  }

  async create(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOrder> {
    const { data } = await jsonRequest<{ order: CheckoutOrder }>('/api/v1/checkout', {
      baseUrl: this.baseUrl,
      accessToken: tokenFrom(this.store),
      method: 'POST',
      json: { address, shippingQuoteId },
      headers: { 'Idempotency-Key': idempotencyKey },
      fetch: this.fetcher,
    })
    return data.order
  }
}

const ZERO_MONEY = { amount: '0', currency: 'IRR' as const }

function expiryFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

/**
 * Dev/e2e checkout mirror (only when `VITE_FIXTURE_CATALOG=true`). Quotes a
 * single fixed shipping method, creates a `PENDING_PAYMENT` order and persists
 * it via the order store so the orders pages render real data locally. It never
 * simulates payment success.
 */
export class CheckoutFixtureClient implements CheckoutApi {
  private readonly cart: StoreCartApi
  private readonly orders: OrderStore
  private readonly createdByKey = new Map<string, CheckoutOrder>()

  constructor(options: { cart: StoreCartApi; orders: OrderStore }) {
    this.cart = options.cart
    this.orders = options.orders
  }

  async preview(): Promise<{ cart: CartView; shipping: ShippingQuote[] }> {
    const cart = await this.cart.getCart()
    const shipping: ShippingQuote[] = [
      {
        quoteId: 'fixture-post-paid',
        method: 'POST',
        title: 'پست پیشتاز',
        amount: ZERO_MONEY,
        policyRevision: 'fixture',
        pricePolicyRevision: cart.quote.pricePolicyRevision,
        cartVersion: cart.version,
        expiresAt: expiryFromNow(60 * 60 * 1000),
      },
    ]
    return { cart, shipping }
  }

  async create(
    address: CheckoutAddress,
    shippingQuoteId: string,
    idempotencyKey: string,
  ): Promise<CheckoutOrder> {
    const existing = this.createdByKey.get(idempotencyKey)
    if (existing) return existing

    const cart = await this.cart.getCart()
    if (cart.lines.length === 0) {
      throw new AuthApiError({ code: 'CART_EMPTY', message: 'سبد خرید خالی است.', statusCode: 400 })
    }
    const quote = cart.quote
    const nextNumber = this.orders.readAll().length + 1
    const createdAt = new Date().toISOString()
    const order: CheckoutOrder = {
      id: `fixture-order-${String(nextNumber).padStart(6, '0')}`,
      number: `FI-${String(nextNumber).padStart(6, '0')}`,
      status: 'PENDING_PAYMENT',
      items: cart.lines.map(line => ({
        variantId: line.variantId,
        productTitle: line.title,
        variantTitle: null,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
      subtotal: quote.subtotal,
      discount: ZERO_MONEY,
      shipping: quote.shipping,
      total: quote.total,
      address,
      shippingQuote:
        (await this.preview()).shipping.find(s => s.quoteId === shippingQuoteId) ?? {
          quoteId: 'fixture-post-paid',
          method: 'POST',
          title: 'پست پیشتاز',
          amount: ZERO_MONEY,
          policyRevision: 'fixture',
          pricePolicyRevision: quote.pricePolicyRevision,
          cartVersion: cart.version,
          expiresAt: expiryFromNow(60 * 60 * 1000),
        },
      pricePolicyRevision: quote.pricePolicyRevision,
      reservationExpiresAt: expiryFromNow(60 * 60 * 1000),
      createdAt,
    }

    this.createdByKey.set(idempotencyKey, order)
    try {
      this.orders.writeAll([...this.orders.readAll(), checkoutOrderToDetail(order)])
    } catch {
      // Order is still returned for the current checkout; persistence is best-effort.
    }
    return order
  }
}