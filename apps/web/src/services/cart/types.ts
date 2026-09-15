import type { Money } from '@iranyaragh/contracts'

/**
 * Storefront cart and order view types.
 *
 * The authoritative domain types live in `@iranyaragh/contracts` (single source
 * of truth). This module declares the slim client-side cart model the storefront
 * renders. Line unit prices are contract `Money` (IRR) values captured from the
 * catalog at add time; totals are computed in Rial and formatted in Toman by
 * `lib/format.ts`.
 *
 * NOTE: In this pre-backend phase the cart is client-side state (in-memory +
 * localStorage). It is intentionally NOT an authority on pricing or inventory;
 * a real server order must re-derive prices from the ledger when the backend
 * lands (COMMERCE_AND_INVENTORY.md).
 */

export type CartLine = {
  productId: string
  slug: string
  name: string
  brand: string | null
  image: string
  /** Unit price in IRR (Rial), captured from the catalog when added. */
  unitPrice: Money
  oldPrice: Money | null
  quantity: number
}

export type CartState = {
  lines: CartLine[]
}

export type CartTotals = {
  /** Sum of line totals in Rial. */
  subtotalRials: number
  shippingRials: number
  /** Total payable in Rial (subtotal + shipping). */
  totalRials: number
  lineCount: number
  itemCount: number
}

export function lineTotalRials(line: CartLine): number {
  const unitPrice = Number(line.unitPrice.amount)
  const total = unitPrice * line.quantity
  if (!Number.isSafeInteger(unitPrice) || !Number.isSafeInteger(line.quantity) || !Number.isSafeInteger(total)) {
    throw new Error('Cart line exceeds the safe Rial calculation range.')
  }
  return total
}

export function computeCartTotals(lines: CartLine[], shippingRials = 0): CartTotals {
  if (!Number.isSafeInteger(shippingRials) || shippingRials < 0) {
    throw new Error('Shipping amount must be a non-negative safe Rial integer.')
  }
  const subtotalRials = lines.reduce((sum, line) => {
    const next = sum + lineTotalRials(line)
    if (!Number.isSafeInteger(next)) throw new Error('Cart total exceeds the safe Rial calculation range.')
    return next
  }, 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const totalRials = subtotalRials + shippingRials
  if (!Number.isSafeInteger(totalRials)) throw new Error('Cart total exceeds the safe Rial calculation range.')
  return {
    subtotalRials,
    shippingRials,
    totalRials,
    lineCount: lines.length,
    itemCount,
  }
}

/**
 * Checkout identity and shipping/billing inputs (client-side shape for the demo
 * flow). This is intentionally a separate, stable form model, not a Prisma or
 * API contract type.
 */
export type CheckoutInput = {
  fullName: string
  mobile: string
  province: string
  city: string
  postalCode: string
  address: string
  note: string
}

export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

export type OrderItem = {
  productId: string
  slug: string
  name: string
  image: string
  unitPrice: Money
  quantity: number
}

export type StoreOrder = {
  id: string
  createdAt: string
  /** Demo-only idempotency marker; the backend will own this field later. */
  idempotencyKey?: string
  status: OrderStatus
  items: OrderItem[]
  shippingRials: number
  subtotalRials: number
  totalRials: number
  shipping: {
    fullName: string
    mobile: string
    province: string
    city: string
    postalCode: string
    address: string
  }
  note?: string
}

export type CreateOrderInput = {
  /** Stable key used to make checkout retries create one logical order. */
  idempotencyKey?: string
  items: OrderItem[]
  shippingRials: number
  subtotalRials: number
  totalRials: number
  shipping: StoreOrder['shipping']
  note?: string
}

/**
 * The order port used by the storefront's demo checkout/orders flow. A real
 * client hitting the order/payment state machines will replace the fixture when
 * the backend lands (COMMERCE_AND_INVENTORY.md); the UI only depends on this
 * interface.
 */
export interface OrderApi {
  createOrder(input: CreateOrderInput): Promise<StoreOrder>
  listOrders(): Promise<StoreOrder[]>
  getOrder(id: string): Promise<StoreOrder>
  /**
   * Demo-only transition: PENDING_PAYMENT -> PAID after a mock gateway success.
   * The real order/payment state machine will supersede this fixture when the
   * backend lands (COMMERCE_AND_INVENTORY.md).
   */
  markPaid(id: string): Promise<StoreOrder>
}
