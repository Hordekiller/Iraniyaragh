import type {
  CartLine as ServerCartLine,
  CartQuote,
  FulfillmentStatus,
  OrderDetail,
  OrderStatus,
  OrderSummary,
  PaymentStatus,
} from '@iranyaragh/contracts'
import { AuthApiError } from '../../lib/auth/errors'
import { moneyToRials } from '../../lib/money'
import type {
  CartLine,
  CartTotals,
} from '../cart/types'

/** Locally-known product enrichment for a server cart line. */
export type KnownLine = Partial<
  Pick<CartLine, 'productId' | 'slug' | 'name' | 'brand' | 'image' | 'oldPrice'>
>

/**
 * Map a server cart line to the unified UI line. The server only guarantees a
 * title, SKU, prices and availability; catalog metadata (image/slug/brand) is
 * attached when the variant was bought in the current session (`known`).
 */
export function serverCartLineToView(
  line: ServerCartLine,
  known?: KnownLine | null,
): CartLine {
  return {
    variantId: line.variantId,
    productId: known?.productId ?? null,
    slug: known?.slug ?? null,
    name: line.title || known?.name || line.sku,
    brand: known?.brand ?? null,
    image: known?.image ?? null,
    sku: line.sku,
    unitPrice: line.unitPrice,
    oldPrice: known?.oldPrice ?? null,
    quantity: line.quantity,
    available: line.available,
  }
}

/** Server quote -> Rial totals (line/item counts are computed by the caller). */
export function cartQuoteToTotals(
  quote: CartQuote,
): Omit<CartTotals, 'lineCount' | 'itemCount'> {
  const subtotalRials = moneyToRials(quote.subtotal)
  const shippingRials = moneyToRials(quote.shipping)
  const totalRials = moneyToRials(quote.total)
  if (!Number.isSafeInteger(subtotalRials + shippingRials)) {
    throw new Error('Cart quote exceeds the safe Rial calculation range.')
  }
  return { subtotalRials, shippingRials, totalRials }
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'پیشنویس',
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداختشده',
  CANCELLED: 'لغو شده',
  RETURNED: 'مرجوع شده',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'در انتظار پرداخت',
  PAID: 'پرداختشده',
  FAILED: 'پرداخت ناموفق',
  CANCELLED: 'پرداخت لغو شده',
  REFUNDED: 'استرداد شده',
  PARTIALLY_REFUNDED: 'استرداد جزئی',
}

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: 'در انتظار آمادهسازی',
  PROCESSING: 'در حال آمادهسازی',
  READY_TO_SHIP: 'آماده ارسال',
  SHIPPED: 'ارسالشده',
  DELIVERED: 'تحویلشده',
  RETURNED: 'مرجوع شده',
  CANCELLED: 'لغو شده',
}

/** Flatten an order summary into the Rial totals the UI renders. */
export function orderSummaryToTotals(
  summary: Pick<OrderSummary, 'totals'>,
): Omit<CartTotals, 'lineCount' | 'itemCount'> {
  const subtotalRials = moneyToRials(summary.totals.subtotal)
  const shippingRials = moneyToRials(summary.totals.shipping)
  const totalRials = moneyToRials(summary.totals.total)
  return { subtotalRials, shippingRials, totalRials }
}

/** Strip an order down to the customer summary card shape rendered by list pages. */
export function orderSummaryFromDetail(order: OrderDetail): OrderSummary {
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

/** Normalize any commerce failure into a user-facing Persian message. */
export function commerceErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.code === 'AUTH_REAUTHENTICATION_REQUIRED') {
      return 'برای ادامه باید دوباره وارد شوید.'
    }
    if (error.code === 'CART_EMPTY') {
      return 'سبد خرید خالی است.'
    }
    if (error.code === 'INSUFFICIENT_STOCK') {
      return 'تعداد درخواستی از موجودی انبار بیشتر است.'
    }
    return error.message || 'درخواست ناموفق بود؛ لطفاً دوباره تلاش کنید.'
  }
  return 'اتصال به سرور برقرار نشد؛ لطفاً دوباره تلاش کنید.'
}

export type { ServerCartLine, CartQuote }