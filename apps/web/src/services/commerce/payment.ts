import type { PaymentInitiation } from '@iranyaragh/contracts'

export function newPaymentIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function')
    throw new Error('Secure random UUID generation is unavailable')
  return `payment-${globalThis.crypto.randomUUID()}`
}

export function redirectToPaymentGateway(url: string): void {
  globalThis.location.assign(url)
}

/** Refuse malformed or substituted payment destinations before leaving the store. */
export function paymentRedirectUrl(
  payment: PaymentInitiation,
  expectedAmount: string,
): string | null {
  if (
    payment.provider !== 'zarinpal' ||
    payment.status !== 'PENDING' ||
    payment.amount.currency !== 'IRR' ||
    payment.amount.amount !== expectedAmount ||
    !/^[A-Za-z0-9-]{1,128}$/.test(payment.authority)
  )
    return null
  try {
    const url = new URL(payment.redirectUrl)
    if (
      url.protocol !== 'https:' ||
      !['payment.zarinpal.com', 'sandbox.zarinpal.com'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== `/pg/StartPay/${payment.authority}`
    )
      return null
    return url.href
  } catch {
    return null
  }
}
