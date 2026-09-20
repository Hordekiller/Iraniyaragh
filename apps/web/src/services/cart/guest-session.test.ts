import { describe, expect, it } from 'vitest'
import {
  DEVELOPMENT_GUEST_CSRF_COOKIE,
  PRODUCTION_GUEST_CSRF_COOKIE,
  readGuestCartCsrfCookie,
} from './guest-session'

describe('readGuestCartCsrfCookie', () => {
  it('prefers the production cookie regardless of order without exposing the HttpOnly token', () => {
    const source = {
      cookie: `${PRODUCTION_GUEST_CSRF_COOKIE}=prod-value; iranyaragh_guest_cart=secret; ${DEVELOPMENT_GUEST_CSRF_COOKIE}=dev-value`,
    }

    expect(readGuestCartCsrfCookie(source)).toBe('prod-value')
  })

  it('reads the development cookie and rejects empty or unrelated values', () => {
    expect(
      readGuestCartCsrfCookie({
        cookie: `other=value; ${DEVELOPMENT_GUEST_CSRF_COOKIE}=dev-value`,
      }),
    ).toBe('dev-value')
    expect(
      readGuestCartCsrfCookie({
        cookie: `${DEVELOPMENT_GUEST_CSRF_COOKIE}=; other=value`,
      }),
    ).toBeNull()
  })
})
