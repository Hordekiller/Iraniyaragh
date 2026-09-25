import { describe, expect, it } from 'vitest'
import type { PaymentInitiation } from '@iranyaragh/contracts'
import { paymentRedirectUrl } from './payment'

const PAYMENT: PaymentInitiation = {
  paymentId: 'payment-1',
  status: 'PENDING',
  provider: 'zarinpal',
  amount: { amount: '57590000', currency: 'IRR' },
  authority: 'abc-123',
  redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/abc-123',
}

describe('paymentRedirectUrl', () => {
  it('accepts a matching server-issued Zarinpal destination', () => {
    expect(paymentRedirectUrl(PAYMENT, '57590000')).toBe(PAYMENT.redirectUrl)
  })

  it.each([
    { redirectUrl: 'https://sandbox.zarinpal.com.evil.test/pg/StartPay/abc-123' },
    { redirectUrl: 'http://sandbox.zarinpal.com/pg/StartPay/abc-123' },
    { redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/other' },
    { redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/abc-123?next=evil' },
    { redirectUrl: 'https://user@sandbox.zarinpal.com/pg/StartPay/abc-123' },
    { authority: 'abc/123' },
    { amount: { amount: '1', currency: 'IRR' as const } },
  ])('rejects an altered payment destination or amount: %j', (change) => {
    expect(paymentRedirectUrl({ ...PAYMENT, ...change }, '57590000')).toBeNull()
  })
})
