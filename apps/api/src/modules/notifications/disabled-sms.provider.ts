import type { SmsProvider, SmsSendResult } from './sms-provider';

/**
 * Stands in for the real SMS transport when `SMS_PROVIDER_MODE=disabled`.
 *
 * Like `DisabledPaymentProvider`, this is not a success-returning stub. It never
 * opens a socket, so no OTP code and no order notification can leave the
 * process, and it reports `disabled` rather than `accepted`, which means a
 * caller can never record a delivery that did not happen.
 */
export class DisabledSmsProvider implements SmsProvider {
  async send(): Promise<SmsSendResult> {
    return { status: 'disabled' };
  }
}
