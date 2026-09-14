import { describe, expect, it, vi } from 'vitest'
import { createCheckoutIdempotencyKey } from './idempotency'

describe('createCheckoutIdempotencyKey', () => {
  it('uses a cryptographically secure UUID source', () => {
    const randomUUID = vi.fn(
      () => '4f44a532-52e8-4c58-b991-a3360ebfc973' as ReturnType<Crypto['randomUUID']>,
    )

    expect(createCheckoutIdempotencyKey({ randomUUID })).toBe(
      'checkout-4f44a532-52e8-4c58-b991-a3360ebfc973',
    )
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('fails closed when secure UUID generation is unavailable', () => {
    expect(() => createCheckoutIdempotencyKey(null)).toThrow(
      'Secure random UUID generation is unavailable',
    )
  })
})
