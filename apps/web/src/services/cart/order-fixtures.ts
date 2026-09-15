import type { ApiErrorCode } from '@iranyaragh/contracts'
import { IRAN_PROVINCES, isValidIranMobile, isValidIranPostalCode, normalizeIranMobile, normalizeIranPostalCode } from '../../lib/iran'
import type { CreateOrderInput, OrderApi, StoreOrder } from './types'

/**
 * Storage adapter for the demo order fixture. The default mirrors orders to
 * `localStorage` so a refreshed session keeps its order history; tests inject a
 * no-op/in-memory store.
 */
export interface OrderStore {
  read(): StoreOrder[]
  write(orders: StoreOrder[]): void
}

export const ORDER_STORAGE_KEY = 'iranyaragh.orders.v1'

function parseOrderHistory(raw: string | null): StoreOrder[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const items = Array.isArray(parsed) ? parsed : []
    return (items as StoreOrder[]).filter(o => o && typeof o.id === 'string')
  } catch {
    return []
  }
}

/** Default localStorage-backed order store (guards non-browser envs). */
export class LocalOrderStore implements OrderStore {
  private readonly key: string;
  private readonly storage: Storage | null;

  constructor(key: string = ORDER_STORAGE_KEY) {
    this.key = key;
    try {
      this.storage = typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      this.storage = null
    }
  }

  read(): StoreOrder[] {
    return parseOrderHistory(this.storage?.getItem(this.key) ?? null);
  }

  write(orders: StoreOrder[]): void {
    if (!this.storage) return
    try {
      this.storage.setItem(this.key, JSON.stringify(orders))
    } catch {
      // Ignore quota/security errors; order history is best-effort in the demo.
    }
  }
}

export class OrderApiError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode?: number;

  constructor(input: { code: ApiErrorCode; message: string; statusCode?: number }) {
    super(input.message)
    this.name = 'OrderApiError'
    this.code = input.code
    this.statusCode = input.statusCode
  }
}

/**
 * Deterministic fixture implementation of the order port for the demo checkout.
 * Creates an order in `PENDING_PAYMENT`, records it, and exposes list/get. It
 * is NOT an authority on pricing/inventory and must be replaced by the real
 * order/payment state machines when the backend lands.
 */
export class OrderFixture implements OrderApi {
  private storeImpl: OrderStore;
  private counter = 0;

  constructor(store: OrderStore) {
    this.storeImpl = store
    this.counter = this.seedCounterFromStore(store.read())
  }

  private seedCounterFromStore(orders: StoreOrder[]): number {
    let max = 0
    for (const order of orders) {
      const match = /^IR-(\d{4})-\d+$/.exec(order.id)
      if (!match) continue
      const sequence = Number(match[1])
      if (Number.isFinite(sequence) && sequence > max) max = sequence
    }
    return max
  }

  async createOrder(input: CreateOrderInput): Promise<StoreOrder> {
    this.validateInput(input)
    const existing = input.idempotencyKey
      ? this.storeImpl.read().find(order => order.idempotencyKey === input.idempotencyKey)
      : undefined
    if (existing) return existing

    this.counter += 1
    const seed = globalThis.crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
    const now = new Date().toISOString()
    const order: StoreOrder = {
      id: `IR-${String(this.counter).padStart(4, '0')}-${seed}`,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
      status: 'PENDING_PAYMENT',
      items: input.items.map(it => ({ ...it })),
      shippingRials: input.shippingRials,
      subtotalRials: input.subtotalRials,
      totalRials: input.totalRials,
      shipping: {
        ...input.shipping,
        mobile: normalizeIranMobile(input.shipping.mobile),
        postalCode: normalizeIranPostalCode(input.shipping.postalCode),
      },
      note: input.note?.trim() || undefined,
    }
    this.storeImpl.write([order, ...this.storeImpl.read()])
    return order
  }

  private validateInput(input: CreateOrderInput): void {
    const productIds = new Set(input.items.map(item => item.productId))
    if (!input.items.length || productIds.size !== input.items.length || input.items.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99)) {
      throw new OrderApiError({ code: 'VALIDATION_ERROR', message: 'اقلام سفارش معتبر نیستند.', statusCode: 422 })
    }
    const subtotal = input.items.reduce((sum, item) => {
      if (item.unitPrice.currency !== 'IRR' || !/^\d+$/.test(item.unitPrice.amount)) return Number.NaN
      return sum + Number(item.unitPrice.amount) * item.quantity
    }, 0)
    if (
      !Number.isSafeInteger(subtotal) ||
      !Number.isSafeInteger(input.shippingRials) ||
      input.shippingRials < 0 ||
      input.subtotalRials !== subtotal ||
      input.totalRials !== input.subtotalRials + input.shippingRials
    ) {
      throw new OrderApiError({ code: 'VALIDATION_ERROR', message: 'مبلغ سفارش معتبر نیست.', statusCode: 422 })
    }
    if (
      input.note && input.note.length > 1000 ||
      !input.shipping.fullName.trim() ||
      !IRAN_PROVINCES.includes(input.shipping.province as (typeof IRAN_PROVINCES)[number]) ||
      input.shipping.city.trim().length < 2 ||
      !isValidIranMobile(input.shipping.mobile) ||
      !isValidIranPostalCode(input.shipping.postalCode) ||
      input.shipping.address.trim().length < 10
    ) {
      throw new OrderApiError({ code: 'VALIDATION_ERROR', message: 'اطلاعات ارسال معتبر نیست.', statusCode: 422 })
    }
  }

  async listOrders(): Promise<StoreOrder[]> {
    return [...this.storeImpl.read()]
  }

  async getOrder(id: string): Promise<StoreOrder> {
    const order = this.storeImpl.read().find(o => o.id === id)
    if (!order) {
      throw new OrderApiError({ code: 'NOT_FOUND', message: 'سفارش یافت نشد.', statusCode: 404 })
    }
    return order
  }

  async markPaid(id: string): Promise<StoreOrder> {
    const current = this.storeImpl.read()
    const order = current.find(o => o.id === id)
    if (!order) {
      throw new OrderApiError({ code: 'NOT_FOUND', message: 'سفارش یافت نشد.', statusCode: 404 })
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new OrderApiError({
        code: 'PAYMENT_STATE_CONFLICT',
        message: 'این سفارش در وضعیت قابل پرداخت نیست.',
        statusCode: 409,
      })
    }
    const updated: StoreOrder = { ...order, status: 'PAID' }
    this.storeImpl.write(current.map(o => (o.id === id ? updated : o)))
    return updated
  }
}
