import type { PaymentProviderName } from '@iranyaragh/contracts';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
export const PAYMENT_GATEWAY_CONFIG = Symbol('PAYMENT_GATEWAY_CONFIG');

export type PaymentGatewayEnvironment = 'sandbox' | 'live';

export type PaymentGatewayConfig = Readonly<{
  providerName: PaymentProviderName;
  mode: PaymentGatewayEnvironment;
  callbackUrl: string;
  timeoutMs: number;
}>;

export type PaymentAuthorizeRequest = Readonly<{
  orderId: string;
  orderNumber: string;
  amountMinorUnits: string;
  currency: 'IRR';
  callbackUrl: string;
  correlationId: string;
}>;

export type PaymentRejectionReason =
  | 'authentication'
  | 'account'
  | 'amount'
  | 'invalid_request'
  | 'unknown';

export type PaymentAuthorizeResult =
  | Readonly<{ status: 'redirect'; authority: string; redirectUrl: string }>
  | Readonly<{ status: 'rejected'; reason: PaymentRejectionReason }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'unknown_result' }>;

export type PaymentVerifyRequest = Readonly<{
  amountMinorUnits: string;
  currency: 'IRR';
  authority: string;
  correlationId: string;
}>;

/**
 * Verification-phase outcome. `failed` is a deterministic gateway answer that
 * the transaction was NOT settled (the buyer cancelled or never paid), so the
 * payment may be marked FAILED. `unavailable` and `unknown_result` are
 * transport/ambiguous outcomes: the gateway may already have settled the
 * transaction, so they must never be recorded as a definitive FAILED.
 */
export type PaymentVerifyResult =
  | Readonly<{ status: 'verified'; referenceId: string }>
  | Readonly<{ status: 'failed'; reason: PaymentRejectionReason }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'unknown_result' }>;

export interface PaymentProvider {
  readonly providerName: PaymentProviderName;
  /**
   * Authorizes a payment. Must resolve within the configured timeout and must
   * never be called from inside a long-running database transaction. The caller
   * must not automatically retry an `unknown_result` because the gateway may
   * already have accepted the request.
   */
  authorize(request: PaymentAuthorizeRequest): Promise<PaymentAuthorizeResult>;
  /**
   * Verifies whether a previously authorized transaction was actually settled.
   * Must not be called from inside a database transaction. A later repeat of an
   * already-verified transaction is reported as `verified` with the original
   * reference id so duplicate callbacks replay idempotently. `unknown_result`
   * must be routed to reconciliation, never to a definitive FAILED.
   */
  verify(request: PaymentVerifyRequest): Promise<PaymentVerifyResult>;
}
