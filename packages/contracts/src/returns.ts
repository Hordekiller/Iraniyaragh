import type { ApiSuccess, Money } from './index';

/**
 * Customer returns against paid orders (policy `returns-v1`).
 *
 * A return records goods received back; it never moves money. The refund is
 * executed manually in the gateway panel and linked to the return afterwards.
 * Windows: 2 business days after invoice issuance for in-person handover,
 * 7 calendar days for orders shipped to another city (Asia/Tehran calendar).
 */
export type ReturnWindowKind = 'IN_PERSON' | 'DELIVERY';
export type ReturnDisposition = 'RESTOCK' | 'DAMAGED' | 'NOT_RETURNED';

export type ReturnIneligibleReason =
  | 'RETURNS_DISABLED'
  | 'ORDER_NOT_PAID'
  | 'PAYMENT_NOT_SETTLED'
  | 'CUSTOM_DOOR_EXCLUDED'
  | 'NO_ISSUED_INVOICE'
  | 'METHOD_UNCLASSIFIED'
  | 'WINDOW_CLOSED'
  | 'FULLY_RETURNED'
  | 'AMOUNTS_DO_NOT_RECONCILE';

export type ReturnEligibilityLine = {
  orderItemId: string;
  sku: string;
  title: string;
  orderedQuantity: number;
  returnedQuantity: number;
  remainingQuantity: number;
  unitPrice: Money;
  /** What the customer paid for the whole line after its share of the order discount. */
  netLineAmount: Money;
};

export type ReturnEligibility = {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  reason: ReturnIneligibleReason | null;
  windowKind: ReturnWindowKind | null;
  policyRevision: string;
  invoiceIssuedAt: string | null;
  /** Inclusive end of the window (end of the last day, Asia/Tehran). */
  deadlineAt: string | null;
  lines: ReturnEligibilityLine[];
  shippingAmount: Money;
};

export type ReturnLineInput = {
  orderItemId: string;
  quantity: number;
  disposition: ReturnDisposition;
  /** Required for RESTOCK, forbidden otherwise. */
  warehouseId?: string;
  locationId?: string;
};

export type ReturnCreateRequest = {
  reason: string;
  note?: string;
  lines: ReturnLineInput[];
};

export type OrderReturnLineView = {
  orderItemId: string;
  sku: string;
  title: string;
  quantity: number;
  disposition: ReturnDisposition;
  unitPrice: Money;
  refundAmount: Money;
  movementId: string | null;
};

export type OrderReturnView = {
  id: string;
  orderId: string;
  orderNumber: string;
  /** `<order number>-R<sequence>` */
  number: string;
  sequence: number;
  windowKind: ReturnWindowKind;
  policyRevision: string;
  invoiceIssuedAt: string;
  deadlineAt: string;
  returnedAt: string;
  merchandiseRefund: Money;
  shippingRefund: Money;
  refundDue: Money;
  refunded: Money;
  refundRemaining: Money;
  reason: string;
  note: string | null;
  lines: OrderReturnLineView[];
  createdAt: string;
};

export type ReturnEligibilityResponse = ApiSuccess<ReturnEligibility>;
export type ReturnResponse = ApiSuccess<OrderReturnView>;
export type ReturnListResponse = ApiSuccess<{
  items: OrderReturnView[];
  meta: { page: number; perPage: number; total: number; pages: number };
}>;

/** Admin on/off switch for recording NEW returns. Off until an administrator turns it on. */
export type ReturnsSettings = { enabled: boolean; version: number; updatedAt: string | null };
export type ReturnsSettingsUpdate = { expectedVersion: number; enabled: boolean };
export type ReturnsPublicConfig = { enabled: boolean };
export type ReturnsSettingsResponse = ApiSuccess<ReturnsSettings>;
export type ReturnsPublicConfigResponse = ApiSuccess<ReturnsPublicConfig>;

export type ReturnHolidayView = { id: string; dateKey: string; label: string; createdAt: string };
export type ReturnHolidayCreateRequest = { dateKey: string; label: string };
export type ReturnHolidayListResponse = ApiSuccess<{ items: ReturnHolidayView[] }>;
export type ReturnHolidayResponse = ApiSuccess<ReturnHolidayView>;

export type ReturnRefundRequest = {
  amountMinorUnits: string;
  gatewayReferenceId: string;
  reason: string;
  note?: string;
};
export type ReturnRefundResponse = ApiSuccess<{
  orderReturn: OrderReturnView;
  refundId: string;
  paymentStatus: 'PARTIALLY_REFUNDED' | 'REFUNDED';
}>;
