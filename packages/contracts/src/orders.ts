import type { ApiSuccess, Money } from './index';
import type { CheckoutAddress } from './cart';

export const ORDER_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAID',
  'CANCELLED',
  'RETURNED',
] as const;

export const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export const FULFILLMENT_STATUSES = [
  'PENDING',
  'PROCESSING',
  'READY_TO_SHIP',
  'SHIPPED',
  'DELIVERED',
  'RETURNED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export type OrderListMeta = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
};

export type OrderTotals = {
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
};

export type OrderSummary = {
  id: string;
  number: string;
  status: OrderStatus;
  payment: {
    latestStatus: PaymentStatus | null;
    attemptCount: number;
  };
  fulfillmentStatus: FulfillmentStatus | null;
  itemCount: number;
  totals: OrderTotals;
  reservationExpiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderCustomer = {
  id: string;
  displayNameMasked: string | null;
  mobileMasked: string;
};

export type AdminOrderAddress = {
  provinceCode: string;
  city: string;
  addressMasked: string;
  postalCodeMasked: string;
  recipientMasked: string;
  mobileMasked: string;
};

export type AdminOrderSummary = OrderSummary & {
  customer: AdminOrderCustomer;
  /**
   * Optimistic-concurrency token for staff commands on this order. It is
   * deliberately absent from the customer-facing OrderSummary: customers never
   * send it, so it is not part of their contract.
   */
  version: number;
};

export type OrderLineSnapshot = {
  variantId: string;
  sku: string;
  productTitle: string;
  variantTitle: string | null;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type OrderPaymentSnapshot = {
  id: string;
  status: PaymentStatus;
  amount: Money;
  createdAt: string;
  updatedAt: string;
};

export type OrderFulfillmentSnapshot = {
  status: FulfillmentStatus;
  createdAt: string;
  updatedAt: string;
};

export type ShipmentSnapshot = {
  id: string;
  carrier: string;
  trackingCode: string;
  status: Extract<FulfillmentStatus, 'SHIPPED' | 'DELIVERED' | 'RETURNED'>;
  dispatchedAt: string;
};

export type ShipmentDispatchResponse = ApiSuccess<{ shipment: ShipmentSnapshot }>;

export type ShipmentDeliveryResponse = ApiSuccess<{ delivery: {
  shipmentId: string;
  orderId: string;
  status: 'DELIVERED';
  proofReference: string;
  confirmedAt: string;
} }>;

export type OrderTimelineEntry = {
  domain: 'ORDER' | 'PAYMENT' | 'FULFILLMENT';
  from: OrderStatus | PaymentStatus | FulfillmentStatus | null;
  to: OrderStatus | PaymentStatus | FulfillmentStatus;
  createdAt: string;
};

export type AdminOrderActor = {
  id: string;
  displayNameMasked: string | null;
};

export type AdminOrderTimelineEntry = OrderTimelineEntry & {
  reason: string | null;
  actor: AdminOrderActor | null;
  requestId: string | null;
};

export type AdminOrderAuditEntry = {
  action: string;
  actor: AdminOrderActor | null;
  requestId: string | null;
  createdAt: string;
};

export type OrderDetail = OrderSummary & {
  address: CheckoutAddress | null;
  shippingMethod: { code: string; title: string };
  pricePolicyRevision: string;
  shippingPolicyRevision: string;
  items: OrderLineSnapshot[];
  payments: OrderPaymentSnapshot[];
  fulfillment: OrderFulfillmentSnapshot | null;
  shipment: ShipmentSnapshot | null;
  timeline: OrderTimelineEntry[];
  truncation: {
    items: boolean;
    payments: boolean;
    timeline: boolean;
  };
};

export type AdminOrderDetail = Omit<
  OrderDetail,
  'address' | 'timeline' | 'truncation'
> & {
  customer: AdminOrderCustomer;
  address: AdminOrderAddress | null;
  timeline: AdminOrderTimelineEntry[];
  audit: AdminOrderAuditEntry[];
  truncation: {
    items: boolean;
    payments: boolean;
    timeline: boolean;
    audit: boolean;
  };
};

export type CustomerOrderListResponse = ApiSuccess<{
  items: OrderSummary[];
  meta: OrderListMeta;
}>;

export type CustomerOrderDetailResponse = ApiSuccess<{ order: OrderDetail }>;

export type AdminOrderListResponse = ApiSuccess<{
  items: AdminOrderSummary[];
  meta: OrderListMeta;
}>;

export type AdminOrderDetailResponse = ApiSuccess<{ order: AdminOrderDetail }>;

export type OrderCommandResult = {
  id: string;
  number: string;
  status: Extract<OrderStatus, 'CANCELLED'>;
  releasedReservations: number;
  cancelledAt: string;
};

export type OrderCancelResponse = ApiSuccess<{ order: OrderCommandResult }>;

export type OrderExpiryRunResponse = ApiSuccess<{ expired: number }>;

/**
 * One requested staff-order line. The client sends only identity and quantity;
 * every amount is priced server-side from the catalog sale price.
 */
export type StaffOrderLineInput = {
  variantId: string;
  quantity: number;
};

export type StaffOrderCreateInput = {
  /**
   * Required in practice, optional in the type so that a guest submission
   * reaches the domain rule and is answered with `GUEST_ORDER_UNSUPPORTED`
   * instead of failing shape validation.
   */
  customerId?: string;
  lines: StaffOrderLineInput[];
  address: CheckoutAddress;
  /**
   * Free-text note recorded on the order for staff traceability.
   *
   * There is deliberately no client-supplied price, discount or total field:
   * every monetary value on a staff order is derived on the server from the
   * catalog sale price, so an operator cannot invent a number that the order
   * state machine never agreed to.
   */
  note?: string;
};

export type StaffOrderOptionKind = 'customer' | 'variant';

export type StaffOrderOption = {
  id: string;
  label: string;
  /**
   * Secondary line for the operator. For a customer this is the masked mobile
   * only: a caller who holds order permissions must not be handed the full
   * number, which is gated behind the customer-record permission.
   */
  detail: string | null;
};

export type StaffOrderOptionsResponse = ApiSuccess<{
  items: StaffOrderOption[];
  count: number;
}>;

export type StaffOrderReservation = {
  id: string;
  variantId: string;
  quantity: number;
  expiresAt: string;
};

export type StaffOrderResult = {
  order: AdminOrderSummary;
  /** True when the Idempotency-Key matched a previously created order. */
  replayed: boolean;
};

export type StaffOrderCreateResponse = ApiSuccess<{
  order: AdminOrderSummary;
  replayed: boolean;
  reservations: StaffOrderReservation[];
}>;
