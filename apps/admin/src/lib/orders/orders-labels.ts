import type { StatusTone } from '@/components/ui/StatusChip';
import type {
  AdminFulfillmentStatus,
  AdminOrderStatus,
  AdminPaymentStatus,
} from './orders-types';

const ORDER_STATUS_META: Record<AdminOrderStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'در انتظار', tone: 'warning' },
  CONFIRMED: { label: 'تأییدشده', tone: 'info' },
  PROCESSING: { label: 'در حال پردازش', tone: 'warning' },
  COMPLETED: { label: 'تکمیل‌شده', tone: 'success' },
  CANCELLED: { label: 'لغو شده', tone: 'error' },
};

export const ORDER_STATUS_LABELS = Object.fromEntries(
  (Object.keys(ORDER_STATUS_META) as AdminOrderStatus[]).map((status) => [
    status,
    ORDER_STATUS_META[status].label,
  ]),
) as Record<AdminOrderStatus, string>;

export function orderStatusLabel(status: AdminOrderStatus): string {
  return ORDER_STATUS_META[status].label;
}

export function orderStatusTone(status: AdminOrderStatus): StatusTone {
  return ORDER_STATUS_META[status].tone;
}

const PAYMENT_STATUS_META: Record<AdminPaymentStatus, { label: string; tone: StatusTone }> = {
  UNPAID: { label: 'پرداخت نشده', tone: 'warning' },
  PENDING: { label: 'در انتظار پرداخت', tone: 'warning' },
  PAID: { label: 'پرداخت‌شده', tone: 'success' },
  PARTIALLY_REFUNDED: { label: 'استرداد جزئی', tone: 'info' },
  REFUNDED: { label: 'استردادشده', tone: 'neutral' },
};

export const PAYMENT_STATUS_LABELS = Object.fromEntries(
  (Object.keys(PAYMENT_STATUS_META) as AdminPaymentStatus[]).map((status) => [
    status,
    PAYMENT_STATUS_META[status].label,
  ]),
) as Record<AdminPaymentStatus, string>;

export function paymentStatusLabel(status: AdminPaymentStatus): string {
  return PAYMENT_STATUS_META[status].label;
}

export function paymentStatusTone(status: AdminPaymentStatus): StatusTone {
  return PAYMENT_STATUS_META[status].tone;
}

const FULFILLMENT_STATUS_META: Record<AdminFulfillmentStatus, { label: string; tone: StatusTone }> = {
  UNFULFILLED: { label: 'تخصیص‌نیافته', tone: 'neutral' },
  ALLOCATED: { label: 'تخصیص‌یافته', tone: 'info' },
  PICKING: { label: 'در حال چیدن', tone: 'warning' },
  PACKED: { label: 'بسته‌بندی‌شده', tone: 'info' },
  SHIPPED: { label: 'ارسال‌شده', tone: 'info' },
  DELIVERED: { label: 'تحویل‌شده', tone: 'success' },
};

export const FULFILLMENT_STATUS_LABELS = Object.fromEntries(
  (Object.keys(FULFILLMENT_STATUS_META) as AdminFulfillmentStatus[]).map((status) => [
    status,
    FULFILLMENT_STATUS_META[status].label,
  ]),
) as Record<AdminFulfillmentStatus, string>;

export function fulfillmentStatusLabel(status: AdminFulfillmentStatus): string {
  return FULFILLMENT_STATUS_META[status].label;
}

export function fulfillmentStatusTone(status: AdminFulfillmentStatus): StatusTone {
  return FULFILLMENT_STATUS_META[status].tone;
}

const faNumber = new Intl.NumberFormat('fa-IR');

/** Format an integer Rial amount with Persian digits: `۱۲٬۳۴۵٬۶۷۸ ریال`. */
export function formatRial(amount: number): string {
  if (!Number.isFinite(amount)) return '—';
  return `${faNumber.format(amount)} ریال`;
}

/** Compact representation of an amount's numeric digits (percentages, counts). */
export function formatCount(value: number): string {
  return faNumber.format(value);
}