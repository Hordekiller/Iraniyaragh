/**
 * Reads the `exp` claim of an access token for scheduling only. The signature is
 * never trusted here: the API authorizes every request, and an unreadable token
 * is simply treated as "not known to be expiring".
 */
export function accessTokenExpiresAt(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims = JSON.parse(atob(base64)) as { exp?: unknown };
    return typeof claims.exp === 'number' && Number.isFinite(claims.exp) ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** True when the token is already expired or will expire within `skewMs`. */
export function accessTokenExpiresSoon(token: string, now = Date.now(), skewMs = 20_000): boolean {
  const expiresAt = accessTokenExpiresAt(token);
  return expiresAt !== null && expiresAt - now <= skewMs;
}
