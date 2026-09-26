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
