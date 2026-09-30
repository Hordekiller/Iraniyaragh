import type { Money } from '@iranyaragh/contracts'

/**
 * Storefront cart view types.
 *
 * The authoritative domain types live in `@iranyaragh/contracts` (single source
 * of truth). This module declares the unified UI cart line rendered by the
 * cart/checkout pages. Two sources feed it:
 * - a guest local draft (in-memory + localStorage, pre-login convenience), and
 * - the authenticated server cart (`services/commerce/cart.ts`), whose lines
 *   carry `variantId`, title, SKU, prices and stock `available` and whose
 *   totals come from the server quote.
 * Line unit prices are contract `Money` (IRR) values; totals are computed in
 * Rial and formatted in Toman by `lib/format.ts`.
 */

export type CartLine = {
  /** Server cart line key (public variant id). */
  variantId: string
  /** Catalog product id, when the line came from the current session. */
  productId: string | null
  /** Catalog slug for the product link; absent for server-sourced lines. */
  slug: string | null
  name: string
  brand: string | null
  /** Catalog image, when known; server-sourced lines may lack one. */
  image: string | null
  sku: string
  /** Unit price in IRR (Rial), captured from the catalog when added. */
  unitPrice: Money
  oldPrice: Money | null
  quantity: number
  /** Server-reported available stock when authoritative; null for guest drafts. */
  available: number | null
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
