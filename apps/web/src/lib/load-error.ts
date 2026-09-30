/**
 * Error classification shared by the data-driven storefront screens.
 *
 * The catalog and commerce clients reject with a `CatalogError`/`CommerceError`
 * carrying the API `code`, so a screen can tell "this product really does not
 * exist" apart from "the request failed". Collapsing the two would tell a
 * customer their item was never in the catalog whenever the network blips.
 */

/** True when the failure is the API's own "no such record" answer. */
export function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown }
  if (code === 'NOT_FOUND') return true
  // A bare 404 from a client that does not map the body still counts.
  return code === undefined && statusCode === 404
}

/** True when the customer is signed out, so a private screen must not leak. */
export function isUnauthenticated(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { code, statusCode } = error as { code?: unknown; statusCode?: unknown }
  if (code === 'UNAUTHENTICATED' || code === 'SESSION_EXPIRED') return true
  return code === undefined && statusCode === 401
}

/**
 * The message shown when a request failed for a reason the storefront cannot
 * fix. It never claims the record is missing, and never guesses at the cause.
 */
export const LOAD_FAILURE_MESSAGE = 'دریافت اطلاعات انجام نشد. لطفاً دوباره تلاش کنید.'
