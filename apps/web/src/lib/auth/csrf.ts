/**
 * Script-readable double-submit CSRF cookie reader (AUTH_CONTRACT §12).
 *
 * The refresh token travels in an HttpOnly cookie; its double-submit CSRF proof
 * is a separate, deliberately client-readable cookie that the browser echoes
 * back as the `X-CSRF-Token` header on cookie-authenticated calls (refresh,
 * logout). Nothing secret is exposed here — the value is already server-issued
 * to the script context by design.
 *
 * The API sets one of two cookie names depending on deployment:
 * - production/staging: the `__Host-` prefixed staff cookie;
 * - local development: the explicitly suffixed development cookie.
 * We read both, preferring the production name, so one helper serves every
 * build. If the server issued a cookie the client cannot read, `refresh`/`logout`
 * fail closed with `AUTH_CSRF_INVALID` rather than guessing.
 */

export const PRODUCTION_CSRF_COOKIE = '__Host-iranyaragh_csrf';
export const DEVELOPMENT_CSRF_COOKIE = 'iranyaragh_customer_csrf';

const CSRF_COOKIE_NAMES = [PRODUCTION_CSRF_COOKIE, DEVELOPMENT_CSRF_COOKIE] as const;

/**
 * Extract the raw value of the first known CSRF cookie present in
 * `document.cookie`, or `null` when none is set. Callers pass the actual
 * `document` so tests can hand in a stub without touching the global.
 */
export function readCsrfCookie(document: Document): string | null {
  const pairs = document.cookie.split(';');
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    const separatorIndex = pairs[i].indexOf('=');
    if (separatorIndex < 0) continue;
    const name = pairs[i].slice(0, separatorIndex).trim();
    if (!CSRF_COOKIE_NAMES.includes(name as (typeof CSRF_COOKIE_NAMES)[number])) continue;
    const value = pairs[i].slice(separatorIndex + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}