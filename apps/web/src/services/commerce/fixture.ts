import type {
  CartLine,
  CartView,
  CheckoutAddress,
  OrderDetail,
  OrderSummary,
  ShippingQuote,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { fixtureAllProducts } from '../catalog/fixture-data'
import type { CommerceApi } from './types'
import type { CartOwner } from './types'
import { EMPTY_CART } from './types'

/** Explicit development/E2E adapter. Production builds never construct this class. */
export class CommerceFixtureClient implements CommerceApi {
  private cart: CartView = EMPTY_CART
  private readonly orders = new Map<string, OrderDetail>()
  private sequence = 0
  private quote: ShippingQuote | null = null

  async getCart(_owner: CartOwner) {
    void _owner
    return structuredClone(this.cart)
  }

  async addLine(_owner: CartOwner, variantId: string, quantity: number) {
    const existing = this.cart.lines.find(
      (line) => line.variantId === variantId,
    )
    return this.setFixtureLine(variantId, (existing?.quantity ?? 0) + quantity)
  }

  async setLine(_owner: CartOwner, variantId: string, quantity: number) {
    return this.setFixtureLine(variantId, quantity)
  }

  async removeLine(_owner: CartOwner, variantId: string) {
    return this.commit(
      this.cart.lines.filter((line) => line.variantId !== variantId),
    )
  }

  async mergeGuestCart() {
    return { cart: structuredClone(this.cart), warnings: [] }
  }

  async previewCheckout() {
    if (this.cart.lines.length === 0)
      throw this.failure('CART_EMPTY', 'سبد خرید خالی است.', 422)
    const now = new Date()
    const shipping = this.cart.quote.subtotal.amount === '0' ? 0 : 590_000
    this.quote = {
      quoteId: `fixture-quote-${this.cart.version}`,
      method: 'fixture-standard',
      title: 'ارسال استاندارد (محیط توسعه)',
      amount: { amount: String(shipping), currency: 'IRR' },
      policyRevision: 'fixture-shipping-v1',
      pricePolicyRevision: this.cart.quote.pricePolicyRevision,
      cartVersion: this.cart.version,
      expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    }
    const cart = this.withShipping(this.cart, shipping)
    this.cart = cart
    return {
      cart: structuredClone(cart),
      shipping: [structuredClone(this.quote)],
    }
  }

  async createCheckout(address: CheckoutAddress, shippingQuoteId: string) {
    if (this.quote?.quoteId !== shippingQuoteId) {
      throw this.failure('CONFLICT', 'پیشنهاد ارسال معتبر نیست.', 409)
    }
    if (new Date(this.quote.expiresAt).getTime() <= Date.now()) {
      throw this.failure('CONFLICT', 'مهلت پیشنهاد ارسال تمام شده است.', 409)
    }
    const quote = this.quote
    const now = new Date()
    const id = `fixture-order-${++this.sequence}`
    const number = `DEV-${String(this.sequence).padStart(5, '0')}`
    const items = this.cart.lines.map((line) => ({
      variantId: line.variantId,
      productTitle: line.title,
      variantTitle: null,
      sku: line.sku,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    }))
    const order = {
      id,
      number,
      status: 'PENDING_PAYMENT' as const,
      items,
      subtotal: this.cart.quote.subtotal,
      discount: { amount: '0', currency: 'IRR' as const },
      shipping: this.cart.quote.shipping,
      total: this.cart.quote.total,
      address,
      shippingQuote: structuredClone(quote),
      pricePolicyRevision: this.cart.quote.pricePolicyRevision,
      reservationExpiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
      createdAt: now.toISOString(),
    }
    this.orders.set(id, {
      id,
      number,
      status: 'PENDING_PAYMENT',
      payment: { latestStatus: null, attemptCount: 0 },
      fulfillmentStatus: null,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      totals: {
        subtotal: order.subtotal,
        discount: order.discount,
        shipping: order.shipping,
        total: order.total,
      },
      reservationExpiresAt: order.reservationExpiresAt,
      createdAt: order.createdAt,
      updatedAt: order.createdAt,
      address,
      shippingMethod: { code: quote.method, title: quote.title },
      pricePolicyRevision: order.pricePolicyRevision,
      shippingPolicyRevision: quote.policyRevision,
      items,
      payments: [],
      fulfillment: null,
      timeline: [
        {
          domain: 'ORDER',
          from: 'DRAFT',
          to: 'PENDING_PAYMENT',
          createdAt: order.createdAt,
        },
      ],
      truncation: { items: false, payments: false, timeline: false },
    })
    this.cart = EMPTY_CART
    this.quote = null
    return structuredClone(order)
  }

  async listOrders() {
    const items: OrderSummary[] = [...this.orders.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({
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
      }))
    return {
      items,
      meta: {
        page: 1,
        perPage: 25,
        total: items.length,
        pages: items.length ? 1 : 0,
      },
    }
  }

  async getOrder(id: string) {
    const order = this.orders.get(id)
    if (!order) throw this.failure('NOT_FOUND', 'سفارش یافت نشد.', 404)
    return structuredClone(order)
  }

  private setFixtureLine(variantId: string, quantity: number) {
    const product = fixtureAllProducts.find((item) =>
      item.variants.some((variant) => variant.id === variantId),
    )
    const variant = product?.variants.find((item) => item.id === variantId)
    if (!product || !variant)
      throw this.failure('SKU_NOT_FOUND', 'تنوع انتخاب‌شده یافت نشد.', 404)
    if (
      variant.stockStatus === 'OUT_OF_STOCK' ||
      variant.stockStatus === 'UNKNOWN'
    ) {
      throw this.failure(
        'CART_QUANTITY_INVALID',
        'این تنوع قابل فروش نیست.',
        422,
      )
    }
    const next = this.cart.lines.filter((line) => line.variantId !== variantId)
    if (quantity > 0) {
      const safeQuantity = Math.min(99, quantity)
      const line: CartLine = {
        variantId,
        quantity: safeQuantity,
        title: product.name,
        sku: variant.sku,
        unitPrice: variant.price,
        lineTotal: {
          amount: String(Number(variant.price.amount) * safeQuantity),
          currency: 'IRR',
        },
        available: 99,
      }
      next.push(line)
    }
    return this.commit(next)
  }

  private commit(lines: CartLine[]) {
    const subtotal = lines.reduce(
      (sum, line) => sum + Number(line.lineTotal.amount),
      0,
    )
    this.cart = {
      id: lines.length ? 'fixture-cart' : null,
      version: this.cart.version + 1,
      lines,
      quote: {
        subtotal: { amount: String(subtotal), currency: 'IRR' },
        shipping: { amount: '0', currency: 'IRR' },
        total: { amount: String(subtotal), currency: 'IRR' },
        currency: 'IRR',
        pricePolicyRevision: 'fixture-price-v1',
        quotedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    }
    this.quote = null
    return structuredClone(this.cart)
  }

  private withShipping(cart: CartView, shipping: number): CartView {
    return {
      ...cart,
      quote: {
        ...cart.quote,
        shipping: { amount: String(shipping), currency: 'IRR' },
        total: {
          amount: String(Number(cart.quote.subtotal.amount) + shipping),
          currency: 'IRR',
        },
        quotedAt: new Date().toISOString(),
      },
    }
  }

  private failure(
    code:
      | 'CART_EMPTY'
      | 'CART_QUANTITY_INVALID'
      | 'CONFLICT'
      | 'NOT_FOUND'
      | 'SKU_NOT_FOUND',
    message: string,
    statusCode: number,
  ) {
    return new AuthApiError({ code, message, statusCode })
  }
}
