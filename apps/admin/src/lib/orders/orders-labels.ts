import type { Money } from '@iranyaragh/contracts';
import type { StatusTone } from '@/components/ui/StatusChip';
import type {
  AdminFulfillmentStatus,
  AdminOrderStatus,
  AdminPaymentStatus,
} from './orders-types';

const ORDER_STATUS_META: Record<AdminOrderStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'پیش‌نویس', tone: 'neutral' },
  PENDING_PAYMENT: { label: 'در انتظار پرداخت', tone: 'warning' },
  PAID: { label: 'پرداخت‌شده', tone: 'success' },
  CANCELLED: { label: 'لغوشده', tone: 'error' },
  RETURNED: { label: 'مرجوع‌شده', tone: 'neutral' },
};

export const ORDER_STATUS_LABELS = Object.fromEntries(
  (Object.keys(ORDER_STATUS_META) as AdminOrderStatus[]).map((status) => [status, ORDER_STATUS_META[status].label]),
) as Record<AdminOrderStatus, string>;

export function orderStatusLabel(status: AdminOrderStatus): string {
  return ORDER_STATUS_META[status].label;
}

export function orderStatusTone(status: AdminOrderStatus): StatusTone {
  return ORDER_STATUS_META[status].tone;
}

const PAYMENT_STATUS_META: Record<AdminPaymentStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'در انتظار', tone: 'warning' },
  PAID: { label: 'پرداخت‌شده', tone: 'success' },
  FAILED: { label: 'ناموفق', tone: 'error' },
  CANCELLED: { label: 'لغوشده', tone: 'neutral' },
  REFUNDED: { label: 'مستردشده', tone: 'neutral' },
  PARTIALLY_REFUNDED: { label: 'استرداد جزئی', tone: 'info' },
};

export const PAYMENT_STATUS_LABELS = Object.fromEntries(
  (Object.keys(PAYMENT_STATUS_META) as AdminPaymentStatus[]).map((status) => [status, PAYMENT_STATUS_META[status].label]),
) as Record<AdminPaymentStatus, string>;

export function paymentStatusLabel(status: AdminPaymentStatus | null): string {
  return status ? PAYMENT_STATUS_META[status].label : 'بدون تلاش پرداخت';
}

export function paymentStatusTone(status: AdminPaymentStatus | null): StatusTone {
  return status ? PAYMENT_STATUS_META[status].tone : 'neutral';
}

const FULFILLMENT_STATUS_META: Record<AdminFulfillmentStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'در انتظار پردازش', tone: 'warning' },
  PROCESSING: { label: 'در حال پردازش', tone: 'info' },
  READY_TO_SHIP: { label: 'آماده ارسال', tone: 'info' },
  SHIPPED: { label: 'ارسال‌شده', tone: 'info' },
  DELIVERED: { label: 'تحویل‌شده', tone: 'success' },
  RETURNED: { label: 'مرجوع‌شده', tone: 'neutral' },
  CANCELLED: { label: 'لغوشده', tone: 'error' },
};

export const FULFILLMENT_STATUS_LABELS = Object.fromEntries(
  (Object.keys(FULFILLMENT_STATUS_META) as AdminFulfillmentStatus[]).map((status) => [status, FULFILLMENT_STATUS_META[status].label]),
) as Record<AdminFulfillmentStatus, string>;

export function fulfillmentStatusLabel(status: AdminFulfillmentStatus | null): string {
  return status ? FULFILLMENT_STATUS_META[status].label : 'شروع نشده';
}

export function fulfillmentStatusTone(status: AdminFulfillmentStatus | null): StatusTone {
  return status ? FULFILLMENT_STATUS_META[status].tone : 'neutral';
}

const faNumber = new Intl.NumberFormat('fa-IR');

export function formatRial(value: Money | string | bigint): string {
  const amount = typeof value === 'object' ? value.amount : value;
  try {
    return `${faNumber.format(BigInt(amount))} ریال`;
  } catch {
    return '—';
  }
}

export function formatCount(value: number): string {
  return faNumber.format(value);
}
