type CryptoWithRandomUuid = Pick<Crypto, 'randomUUID'>

export function createCheckoutIdempotencyKey(
  cryptoSource: CryptoWithRandomUuid | null | undefined = globalThis.crypto,
): string {
  if (typeof cryptoSource?.randomUUID !== 'function') {
    throw new Error('Secure random UUID generation is unavailable')
  }

  return `checkout-${cryptoSource.randomUUID()}`
}
