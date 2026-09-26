import type { ApiSuccess, Money, OrderListMeta, OrderStatus, PaymentStatus } from './index';

export const PAYMENT_PROVIDER_NAMES = ['zarinpal'] as const;

export type PaymentProviderName = (typeof PAYMENT_PROVIDER_NAMES)[number];

/**
 * Server-issued payment initiation outcome. The amount and provider name are
 * never client input: the amount is read from `Order.grandTotal` (integer Rial)
 * and the provider is the single configured V1 gateway. The browser receives
 * only a redirect target; it is never treated as the payment authority.
 */
export type PaymentInitiation = {
  paymentId: string;
  status: 'PENDING';
  provider: PaymentProviderName;
  amount: Money;
  authority: string;
  redirectUrl: string;
};

export type PaymentInitiationResponse = ApiSuccess<{
  payment: PaymentInitiation;
}>;

/**
 * Server-side payment verification result after gateway confirmation. The
 * gateway callback itself is never treated as proof; only a provider `verify`
 * outcome moves the financial state machine. `outcome` tells a client or the
 * operations team whether the money path settled, replayed, or still needs
 * reconciliation (`ACCEPTED_UNCONFIRMED` / `VERIFIED_AFTER_CANCELLED`).
 */
export type PaymentVerificationStatus = 'PAID' | 'PENDING' | 'FAILED';

export type PaymentVerificationOutcome =
  | 'VERIFIED'
  | 'REPLAY'
  | 'VERIFIED_AFTER_CANCELLED'
  | 'NOT_PAID'
  | 'ACCEPTED_UNCONFIRMED';

export type PaymentVerification = {
  paymentId: string;
  status: PaymentVerificationStatus;
  provider: PaymentProviderName;
  amount: Money;
  authority: string;
  referenceId?: string;
  outcome: PaymentVerificationOutcome;
  orderId: string;
  orderStatus: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';
  consumedReservations?: number;
  fulfillmentId?: string;
};

export type PaymentVerificationResponse = ApiSuccess<{
  verification: PaymentVerification;
}>;

/** Staff-safe evidence. Gateway authority and idempotency material are excluded. */
export type AdminPaymentSummary = {
  id: string;
  order: { id: string; number: string; status: OrderStatus };
  provider: string;
  amount: Money;
  status: PaymentStatus;
  referenceId: string | null;
  gatewayEnvironment: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminPaymentTransition = {
  from: PaymentStatus;
  to: PaymentStatus;
  reason: string | null;
  requestId: string | null;
  createdAt: string;
};

/**
 * Staff-recorded refund of money staff already returned in the gateway panel.
 * Zarinpal v4 has no refund API, so this is evidence, never a transfer request.
 * The request carries no order or customer identity on purpose: the payment row
 * is the only source, and the amount is validated against the server-side
 * remaining refundable total.
 */
export type AdminRefundRequest = {
  amountMinorUnits: string;
  gatewayReferenceId: string;
  reason: string;
  note?: string;
};

export type RefundStatus = 'RECORDED';

export type AdminRefundRecord = {
  refundId: string;
  amount: Money;
  status: RefundStatus;
  gatewayReferenceId: string;
  reason: string;
  note: string | null;
  createdAt: string;
};

export type AdminRefund = AdminRefundRecord & {
  paymentId: string;
  orderId: string;
  note: string | null;
  paymentStatus: 'REFUNDED' | 'PARTIALLY_REFUNDED';
  refundedTotal: Money;
  remainingRefundable: Money;
};

export type AdminRefundResponse = ApiSuccess<{ refund: AdminRefund }>;

export type AdminPaymentDetail = AdminPaymentSummary & {
  transitions: AdminPaymentTransition[];
  transitionsTruncated: boolean;
  reconciliationEligible: boolean;
  refundedTotal: Money;
  remainingRefundable: Money;
  refundEligible: boolean;
  refunds: AdminRefundRecord[];
  refundsTruncated: boolean;
};

export type AdminPaymentListResponse = ApiSuccess<{
  items: AdminPaymentSummary[];
  meta: OrderListMeta;
}>;

export type AdminPaymentDetailResponse = ApiSuccess<{ payment: AdminPaymentDetail }>;

/** Manual re-query result: no gateway authority or redirect target is exposed. */
export type AdminPaymentReconciliation = {
  paymentId: string;
  status: PaymentVerificationStatus;
  outcome: PaymentVerificationOutcome;
  referenceId: string | null;
  orderId: string;
  orderStatus: OrderStatus;
};

export type AdminPaymentReconciliationResponse = ApiSuccess<{
  reconciliation: AdminPaymentReconciliation;
}>;
