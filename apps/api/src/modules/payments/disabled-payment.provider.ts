import type { PaymentProviderName } from '@iranyaragh/contracts';
import type {
  PaymentAuthorizeResult,
  PaymentProvider,
  PaymentVerifyResult,
} from './payment-provider.port';

/**
 * Stands in for the real gateway when `PAYMENT_PROVIDER_MODE=disabled`.
 *
 * This is deliberately the opposite of a stub that returns success. It makes no
 * network call and cannot mint an authority, a reference id, or any other
 * settlement evidence, so a deployment with the gateway switched off is
 * incapable of reporting a paid order. Both methods resolve to `disabled`,
 * which callers treat as "no gateway call happened" rather than "the buyer
 * declined" or "the gateway is down".
 */
export class DisabledPaymentProvider implements PaymentProvider {
  readonly providerName: PaymentProviderName = 'zarinpal';

  async authorize(): Promise<PaymentAuthorizeResult> {
    return { status: 'disabled' };
  }

  async verify(): Promise<PaymentVerifyResult> {
    return { status: 'disabled' };
  }
}
