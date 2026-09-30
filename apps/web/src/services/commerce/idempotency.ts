/**
 * Idempotency keys for storefront commerce mutations.
 *
 * Cart and checkout mutations require a caller-supplied `Idempotency-Key`
 * (the server replays duplicates instead of double-applying). Keys are scoped
 * per operation so a retried checkout can never be mistaken for a cart write.
 */
type CryptoWithRandomUuid = Pick<Crypto, 'randomUUID'>

export function createIdempotencyKey(
  scope: 'cart-line' | 'cart-set-qty' | 'cart-remove' | 'checkout',
  cryptoSource: CryptoWithRandomUuid | null | undefined = globalThis.crypto,
): string {
  if (typeof cryptoSource?.randomUUID !== 'function') {
    throw new Error('Secure random UUID generation is unavailable')
  }

  return `${scope}-${cryptoSource.randomUUID()}`
}

/**
 * A retried checkout must reuse the key from the first attempt so a duplicate
 * network retry cannot create two orders. Generated once per checkout session;
 * passed through `createCheckout` and the mutate call.
 */
export function createCheckoutIdempotencyKey(
  cryptoSource: CryptoWithRandomUuid | null | undefined = globalThis.crypto,
): string {
  return createIdempotencyKey('checkout', cryptoSource)
}