import type {
  CartQuote,
  CartView,
  Money,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { jsonRequest } from '../../lib/auth/request'
import type { MemorySessionStore } from '../../lib/auth/session-store'
import { moneyToRials } from '../../lib/money'
import { createIdempotencyKey } from './idempotency'

/** Port the CartProvider depends on; toggleable between HTTP and fixture. */
export interface StoreCartApi {
  getCart(): Promise<CartView>
  addLine(variantId: string, quantity: number): Promise<CartView>
  setQuantity(variantId: string, quantity: number): Promise<CartView>
  removeLine(variantId: string): Promise<CartView>
}

export type StoreCartApiOptions = {
  /** Access token vault; the client reads the bearer token lazily per call. */
  store: MemorySessionStore
  fetch?: typeof fetch
  baseUrl?: string
}

const REQUIRED_AUTH = 'AUTH_REAUTHENTICATION_REQUIRED'

function bearerFrom(store: MemorySessionStore): string {
  const token = store.getAccessToken()
  if (!token) {
    throw new AuthApiError({
      code: REQUIRED_AUTH,
      message: 'برای دسترسی به سبد خرید ابتدا وارد شوید.',
      statusCode: 401,
    })
  }
  return token
}

/**
 * Live cart client against the merchant `/api/v1/cart` endpoints. Reads the
 * bearer token from the session store on every call so it never persists or
 * logs credentials; mutations always carry an `Idempotency-Key`.
 */
export class CartHttpClient implements StoreCartApi {
  private readonly store: MemorySessionStore
  private readonly baseUrl: string
  private readonly fetcher?: typeof fetch

  constructor(options: StoreCartApiOptions) {
    this.store = options.store
    this.baseUrl = options.baseUrl ?? ''
    this.fetcher = options.fetch
  }

  async getCart(): Promise<CartView> {
    const { data } = await jsonRequest<{ cart: CartView }>('/api/v1/cart', {
      baseUrl: this.baseUrl,
      accessToken: bearerFrom(this.store),
      fetch: this.fetcher,
    })
    return data.cart
  }

  async addLine(variantId: string, quantity: number): Promise<CartView> {
    const { data } = await jsonRequest<{ cart: CartView }>('/api/v1/cart/lines', {
      baseUrl: this.baseUrl,
      accessToken: bearerFrom(this.store),
      method: 'POST',
      json: { variantId, quantity },
      headers: { 'Idempotency-Key': createIdempotencyKey('cart-line') },
      fetch: this.fetcher,
    })
    return data.cart
  }

  async setQuantity(variantId: string, quantity: number): Promise<CartView> {
    const { data } = await jsonRequest<{ cart: CartView }>(
      `/api/v1/cart/lines/${encodeURIComponent(variantId)}`,
      {
        baseUrl: this.baseUrl,
        accessToken: bearerFrom(this.store),
        method: 'PUT',
        json: { quantity },
        headers: { 'Idempotency-Key': createIdempotencyKey('cart-set-qty') },
        fetch: this.fetcher,
      },
    )
    return data.cart
  }

  async removeLine(variantId: string): Promise<CartView> {
    const { data } = await jsonRequest<{ cart: CartView }>(
      `/api/v1/cart/lines/${encodeURIComponent(variantId)}`,
      {
        baseUrl: this.baseUrl,
        accessToken: bearerFrom(this.store),
        method: 'DELETE',
        headers: { 'Idempotency-Key': createIdempotencyKey('cart-remove') },
        fetch: this.fetcher,
      },
    )
    return data.cart
  }
}

/** Dev-only price hook the fixture client resolves variant prices through. */
export type FixturePriceLookup = (
  variantId: string,
) => { title: string; sku: string; unitPrice: Money } | undefined

function fixtureQuote(lines: CartView['lines']): CartQuote {
  const subtotalRials = lines.reduce(
    (sum, line) => sum + moneyToRials(line.unitPrice) * line.quantity,
    0,
  )
  const shippingRials = 0
  return {
    subtotal: { amount: String(subtotalRials), currency: 'IRR' },
    shipping: { amount: String(shippingRials), currency: 'IRR' },
    total: { amount: String(subtotalRials + shippingRials), currency: 'IRR' },
    currency: 'IRR',
    pricePolicyRevision: 'fixture',
    quotedAt: new Date().toISOString(),
  }
}

/**
 * Dev/e2e mirror of the cart API. Only wired when `VITE_FIXTURE_CATALOG=true` is
 * baked into the build (see `services/commerce`), never in a shipped build. It
 * emulates the server merge/quote semantics so the storefront can be exercised
 * end-to-end before the cart ledger is deployed.
 */
export class CartFixtureClient implements StoreCartApi {
  private readonly lines = new Map<string, CartView['lines'][number]>()
  private readonly priceLookup: FixturePriceLookup
  private version = 1

  constructor(options: { priceLookup?: FixturePriceLookup }) {
    this.priceLookup = options.priceLookup ?? (() => undefined)
  }

  private snapshot(): CartView {
    return {
      id: 'fixture-cart',
      version: this.version,
      lines: [...this.lines.values()].map(line => ({ ...line })),
      quote: fixtureQuote([...this.lines.values()]),
      updatedAt: new Date().toISOString(),
    }
  }

  private requireKnown(variantId: string): NonNullable<ReturnType<FixturePriceLookup>> {
    const known = this.priceLookup(variantId)
    if (!known) {
      throw new AuthApiError({
        code: 'NOT_FOUND',
        message: `variant ${variantId} not found`,
        statusCode: 404,
      })
    }
    return known
  }

  async getCart(): Promise<CartView> {
    return this.snapshot()
  }

  async addLine(variantId: string, quantity: number): Promise<CartView> {
    const known = this.requireKnown(variantId)
    const existing = this.lines.get(variantId)
    if (existing) {
      this.lines.set(variantId, {
        ...existing,
        quantity: Math.min(99, existing.quantity + quantity),
      })
    } else {
      this.lines.set(variantId, {
        variantId,
        quantity,
        title: known.title,
        sku: known.sku,
        unitPrice: known.unitPrice,
        lineTotal: {
          amount: String(moneyToRials(known.unitPrice) * quantity),
          currency: 'IRR',
        },
        available: 1000,
      })
    }
    this.version += 1
    return this.snapshot()
  }

  async setQuantity(variantId: string, quantity: number): Promise<CartView> {
    const clamped = Math.min(99, Math.max(0, Math.trunc(quantity)))
    if (clamped === 0) return this.removeLine(variantId)
    const existing = this.lines.get(variantId)
    if (!existing) throw new AuthApiError({ code: 'NOT_FOUND', message: 'خط سبد یافت نشد.', statusCode: 404 })
    this.lines.set(variantId, { ...existing, quantity: clamped })
    this.version += 1
    return this.snapshot()
  }

  async removeLine(variantId: string): Promise<CartView> {
    this.lines.delete(variantId)
    this.version += 1
    return this.snapshot()
  }
}

export function buildFixturePriceLookup(
  products: ReadonlyArray<{
    name: string
    variants: ReadonlyArray<{
      id: string
      sku: string
      title: string | null
      salePrice: Money
    }>
  }>,
): FixturePriceLookup {
  const byVariant = new Map<string, ReturnType<FixturePriceLookup>>()
  for (const product of products) {
    for (const variant of product.variants) {
      byVariant.set(variant.id, {
        title: variant.title ?? product.name,
        sku: variant.sku,
        unitPrice: variant.salePrice,
      })
    }
  }
  return (variantId) => byVariant.get(variantId)
}