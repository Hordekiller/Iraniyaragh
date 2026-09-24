import type { ApiSuccess, Money } from './index';

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
