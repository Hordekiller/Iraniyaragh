import type { StatusTone } from '@/components/ui/StatusChip';
import type {
  AdminCustomerAuditEntry,
  AdminCustomerNote,
  CustomerNoteVisibility,
  CustomerStatus,
} from '@iranyaragh/contracts';
import {
  FULFILLMENT_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatRial,
} from '@/lib/orders/orders-labels';

const CUSTOMER_STATUS_META: Record<CustomerStatus, { label: string; tone: StatusTone }> = {
  ACTIVE: { label: 'فعال', tone: 'success' },
  INACTIVE: { label: 'غیرفعال', tone: 'neutral' },
};

export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  ACTIVE: CUSTOMER_STATUS_META.ACTIVE.label,
  INACTIVE: CUSTOMER_STATUS_META.INACTIVE.label,
};

export function customerStatusLabel(status: CustomerStatus): string {
  return CUSTOMER_STATUS_META[status].label;
}

export function customerStatusTone(status: CustomerStatus): StatusTone {
  return CUSTOMER_STATUS_META[status].tone;
}

const NOTE_VISIBILITY_META: Record<CustomerNoteVisibility, { label: string; tone: StatusTone }> = {
  INTERNAL: { label: 'داخلی', tone: 'neutral' },
  CUSTOMER_VISIBLE: { label: 'قابل مشاهده برای مشتری', tone: 'info' },
};

export function noteVisibilityLabel(visibility: CustomerNoteVisibility): string {
  return NOTE_VISIBILITY_META[visibility].label;
}

export function noteVisibilityTone(visibility: CustomerNoteVisibility): StatusTone {
  return NOTE_VISIBILITY_META[visibility].tone;
}

const faNumber = new Intl.NumberFormat('fa-IR');

export function formatCount(value: number): string {
  return faNumber.format(value);
}

export function customerDisplayName(row: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const name = [row.firstName, row.lastName].filter(Boolean).join(' ');
  return name || 'بدون نام';
}

const NOTE_BODY_LIMIT = 2000;

export function noteBodyError(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'متن یادداشت الزامی است.';
  if (trimmed.length > NOTE_BODY_LIMIT) {
    return `متن یادداشت حداکثر ${faNumber.format(NOTE_BODY_LIMIT)} نویسه است.`;
  }
  return null;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  'customer.created': 'ایجاد مشتری',
  'customer.updated': 'ویرایش مشتری',
  'customer.addresses_replaced': 'جایگزینی نشانی‌ها',
  'customer.note_added': 'افزودن یادداشت',
  'customer.deactivated': 'غیرفعال‌سازی مشتری',
  'customer.reactivated': 'فعال‌سازی مجدد مشتری',
};

export function customerAuditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

export { FULFILLMENT_STATUS_LABELS, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatRial };
export type { AdminCustomerAuditEntry, AdminCustomerNote };
