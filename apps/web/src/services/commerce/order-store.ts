import type {
  CheckoutOrder,
  OrderDetail,
} from '@iranyaragh/contracts'

export interface OrderStore {
  readAll(): OrderDetail[]
  writeAll(orders: OrderDetail[]): void
}

const STORE_KEY = 'iranyaragh.orders.fixture.v1'

/** localStorage-backed order store used by the dev/e2e fixture path only. */
export class LocalOrderStore implements OrderStore {
  private readonly storage: Storage
  private readonly key: string

  constructor(storage: Storage = globalThis.localStorage, key: string = STORE_KEY) {
    this.storage = storage
    this.key = key
  }

  readAll(): OrderDetail[] {
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(
        (entry): entry is OrderDetail =>
          Boolean(
            entry &&
              typeof entry === 'object' &&
              typeof (entry as Partial<OrderDetail>).id === 'string',
          ),
      )
    } catch {
      return []
    }
  }

  writeAll(orders: OrderDetail[]): void {
    try {
      this.storage.setItem(this.key, JSON.stringify(orders))
    } catch {
      // localStorage can be unavailable (private mode); the fixture degrades to
      // an in-memory order history for the current tab.
    }
  }
}

/** Expand a `CheckoutOrder` snapshot into the full `OrderDetail` shape. */
export function checkoutOrderToDetail(order: CheckoutOrder): OrderDetail {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    payment: { latestStatus: 'PENDING', attemptCount: 0 },
    fulfillmentStatus: null,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    totals: {
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      total: order.total,
    },
    reservationExpiresAt: order.reservationExpiresAt,
    createdAt: order.createdAt,
    updatedAt: order.createdAt,
    address: order.address,
    shippingMethod: {
      code: order.shippingQuote.method,
      title: order.shippingQuote.title,
    },
    pricePolicyRevision: order.pricePolicyRevision,
    shippingPolicyRevision: order.shippingQuote.policyRevision,
    items: order.items.map(item => ({
      variantId: item.variantId,
      sku: item.sku,
      productTitle: item.productTitle,
      variantTitle: item.variantTitle,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    payments: [],
    fulfillment: null,
    timeline: [],
    truncation: { items: false, payments: false, timeline: false },
  }
}