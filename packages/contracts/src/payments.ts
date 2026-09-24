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