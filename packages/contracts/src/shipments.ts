import type { ApiSuccess } from './api';
import type { FulfillmentStatus } from './orders';
import type { OrderListMeta } from './orders';

/**
 * Staff-facing shipment read contracts. Every field is derived from persisted
 * rows; the API never invents or backfills shipment facts.
 *
 * Customer identity stays masked exactly as in the order read model, so a
 * shipment read never widens PII exposure beyond what order staff already see.
 */
export type AdminShipmentCustomer = {
  id: string;
  displayNameMasked: string | null;
  mobileMasked: string;
};

export type AdminShipmentAddress = {
  provinceCode: string;
  city: string;
  addressMasked: string;
  postalCodeMasked: string;
  recipientMasked: string;
  mobileMasked: string;
};

export type AdminShipmentActor = {
  id: string;
  displayNameMasked: string | null;
};

export type AdminShipmentLine = {
  orderItemId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
};

/**
 * A timeline entry is always a persisted fulfillment transition. The API
 * classifies the transition and exposes the staff delivery proof reference,
 * but never echoes the free-text `reason` column: operators can type anything
 * there and `shipments.read` must not widen into another permission's text.
 */
export type AdminShipmentEventKind =
  | 'DISPATCH'
  | 'DELIVERY_PROOF'
  | 'STATE_CHANGE';

export type AdminShipmentEvent = {
  id: string;
  from: FulfillmentStatus | null;
  to: FulfillmentStatus;
  kind: AdminShipmentEventKind;
  proofReference: string | null;
  actor: AdminShipmentActor | null;
  requestId: string | null;
  createdAt: string;
};

export type AdminShipmentSummary = {
  id: string;
  orderId: string;
  orderNumber: string;
  status: FulfillmentStatus;
  carrier: string;
  trackingCode: string;
  itemCount: number;
  totalQuantity: number;
  city: string | null;
  customer: AdminShipmentCustomer;
  dispatchedAt: string;
};

export type AdminShipmentDetail = AdminShipmentSummary & {
  address: AdminShipmentAddress | null;
  dispatchedBy: AdminShipmentActor | null;
  lines: AdminShipmentLine[];
  timeline: AdminShipmentEvent[];
};

export type AdminShipmentListResponse = ApiSuccess<{
  items: AdminShipmentSummary[];
  meta: OrderListMeta;
}>;

export type AdminShipmentDetailResponse = ApiSuccess<{
  shipment: AdminShipmentDetail;
}>;
