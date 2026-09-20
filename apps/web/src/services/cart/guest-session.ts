export const PRODUCTION_GUEST_CSRF_COOKIE = '__Host-iranyaragh_guest_csrf'
export const DEVELOPMENT_GUEST_CSRF_COOKIE = 'iranyaragh_guest_csrf'

const GUEST_CSRF_COOKIE_NAMES = [
  PRODUCTION_GUEST_CSRF_COOKIE,
  DEVELOPMENT_GUEST_CSRF_COOKIE,
] as const

type CookieDocument = Pick<Document, 'cookie'>

/**
 * Reads only the deliberately script-visible double-submit value. The opaque
 * Guest Cart credential remains HttpOnly and is never exposed to application
 * code, storage, URLs, logs or analytics.
 */
export function readGuestCartCsrfCookie(
  documentSource: CookieDocument,
): string | null {
  const pairs = documentSource.cookie.split(';')
  for (const expectedName of GUEST_CSRF_COOKIE_NAMES) {
    for (let index = pairs.length - 1; index >= 0; index -= 1) {
      const separatorIndex = pairs[index].indexOf('=')
      if (separatorIndex < 0) continue
      const name = pairs[index].slice(0, separatorIndex).trim()
      if (name !== expectedName) continue
      const value = pairs[index].slice(separatorIndex + 1).trim()
      if (value.length > 0) return value
    }
  }
  return null
}
