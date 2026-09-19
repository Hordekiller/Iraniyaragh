import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '@iranyaragh/contracts'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  CANCELLED: 'لغو شده',
  RETURNED: 'مرجوع‌شده',
}

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'در حال بررسی',
  PAID: 'تأییدشده',
  FAILED: 'ناموفق',
  CANCELLED: 'لغو شده',
  REFUNDED: 'بازپرداخت‌شده',
  PARTIALLY_REFUNDED: 'بخشی بازپرداخت‌شده',
}

export const FULFILLMENT_STATUS_LABEL: Record<FulfillmentStatus, string> = {
  PENDING: 'در انتظار پردازش',
  PROCESSING: 'در حال آماده‌سازی',
  READY_TO_SHIP: 'آماده ارسال',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  RETURNED: 'بازگشت‌خورده',
  CANCELLED: 'لغو شده',
}

export function orderStatusClass(status: OrderStatus): string {
  if (status === 'PAID')
    return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (status === 'CANCELLED' || status === 'RETURNED')
    return 'border-red-200 bg-red-50 text-red-800'
  if (status === 'PENDING_PAYMENT')
    return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-slate-200 bg-slate-100 text-slate-700'
}
