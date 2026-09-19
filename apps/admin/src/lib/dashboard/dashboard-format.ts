import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
  ReservationStatus,
  TransferStatus,
} from '@iranyaragh/contracts';

export type DashboardStatus =
  | OrderStatus
  | PaymentStatus
  | FulfillmentStatus
  | ReservationStatus
  | TransferStatus;

const STATUS_LABELS: Record<DashboardStatus, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_PAYMENT: 'در انتظار پرداخت',
  PAID: 'پرداخت‌شده',
  CANCELLED: 'لغوشده',
  RETURNED: 'مرجوع‌شده',
  PENDING: 'در انتظار',
  FAILED: 'ناموفق',
  REFUNDED: 'بازپرداخت‌شده',
  PARTIALLY_REFUNDED: 'بازپرداخت جزئی',
  PROCESSING: 'در حال پردازش',
  READY_TO_SHIP: 'آمادهٔ ارسال',
  SHIPPED: 'ارسال‌شده',
  DELIVERED: 'تحویل‌شده',
  ACTIVE: 'فعال',
  CONSUMED: 'مصرف‌شده',
  RELEASED: 'آزادشده',
  EXPIRED: 'منقضی‌شده',
  REQUESTED: 'درخواست‌شده',
  APPROVED: 'تأییدشده',
  IN_TRANSIT: 'در مسیر',
  RECEIVED: 'دریافت‌شده',
};

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'] as const;

export function dashboardStatusLabel(status: DashboardStatus): string {
  return STATUS_LABELS[status];
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('fa-IR').format(value);
}

export function formatIrr(amount: string): string {
  const grouped = amount.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  const localized = grouped.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
  return `${localized} ریال`;
}

const iranDateTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function formatIranDateTime(value: string): string {
  return iranDateTime.format(new Date(value));
}

export function formatDashboardRange(from: string, toExclusive: string): string {
  return `${formatIranDateTime(from)} تا ${formatIranDateTime(toExclusive)}`;
}
