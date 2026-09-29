import type { StatusTone } from '@/components/ui/StatusChip';
import type {
  AdminShipmentEvent,
  AdminShipmentEventKind,
  AdminShipmentStatus,
  ShipmentStatus,
} from './shipments-types';
import { SHIPMENT_STATUSES } from './shipments-types';

const SHIPMENT_STATUS_META: Record<AdminShipmentStatus, { label: string; tone: StatusTone }> = {
  PENDING: { label: 'در انتظار پردازش', tone: 'warning' },
  PROCESSING: { label: 'در حال پردازش', tone: 'info' },
  READY_TO_SHIP: { label: 'آماده ارسال', tone: 'info' },
  SHIPPED: { label: 'ارسال‌شده', tone: 'info' },
  DELIVERED: { label: 'تحویل‌شده', tone: 'success' },
  RETURNED: { label: 'مرجوع‌شده', tone: 'neutral' },
  CANCELLED: { label: 'لغوشده', tone: 'error' },
};

export const SHIPMENT_STATUS_LABELS = Object.fromEntries(
  SHIPMENT_STATUSES.map((status) => [status, SHIPMENT_STATUS_META[status].label]),
) as Record<ShipmentStatus, string>;

export function shipmentStatusLabel(status: AdminShipmentStatus): string {
  return SHIPMENT_STATUS_META[status].label;
}

export function shipmentStatusTone(status: AdminShipmentStatus): StatusTone {
  return SHIPMENT_STATUS_META[status].tone;
}

const faNumber = new Intl.NumberFormat('fa-IR');

export function formatCount(value: number): string {
  return faNumber.format(value);
}

export function describeShipmentCount(itemCount: number, totalQuantity: number): string {
  return `${faNumber.format(totalQuantity)} عدد در ${faNumber.format(itemCount)} قلم کالا`;
}

const EVENT_KIND_LABELS: Record<AdminShipmentEventKind, string> = {
  DISPATCH: 'ثبت ارسال',
  DELIVERY_PROOF: 'تأیید تحویل با مدرک',
  STATE_CHANGE: 'تغییر وضعیت',
};

export function shipmentEventKindLabel(kind: AdminShipmentEventKind): string {
  return EVENT_KIND_LABELS[kind];
}

/**
 * The transition text only uses the typed `from`/`to` statuses; the API never
 * exposes the free-text transition reason, so nothing else can reach the UI.
 */
export function shipmentEventTransition(event: AdminShipmentEvent): string {
  const from = event.from ? shipmentStatusLabel(event.from) : 'وضعیت اولیه';
  return `${from} ← ${shipmentStatusLabel(event.to)}`;
}

export function shipmentEventActor(event: AdminShipmentEvent): string {
  return event.actor?.displayNameMasked ?? 'سیستم';
}
