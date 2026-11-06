import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Idempotent refresh recovery material.
 *
 * When a browser supplies a refresh-attempt ID, the successor tokenPair of
 * that rotation are sealed (AES-256-GCM) under a key derived from the *previous*
 * refresh token and the attempt ID. The database therefore holds nothing that
 * can be opened without BOTH values: a database/backup reader cannot recover the
 * successor, and an attacker holding only a stolen old token cannot either,
 * because the attempt ID is a random client-held idempotency key that never
 * appears in any credential. The attempt ID is not authentication proof by
 * itself: the old refresh token, CSRF and Origin are still required.
 */
export const REFRESH_RECOVERY_WINDOW_MS = 15_000;
export const REFRESH_ATTEMPT_HEADER = 'x-refresh-attempt';
const ATTEMPT_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;
const INFO = Buffer.from('iranyaragh:refresh-recovery:v1');

export type RecoveredTokenPair = { readonly refreshToken: string; readonly csrfToken: string };

/** Returns a well-formed attempt ID or undefined (malformed values are ignored, never trusted). */
export function parseRefreshAttemptId(value: unknown): string | undefined {
  return typeof value === 'string' && ATTEMPT_PATTERN.test(value) ? value : undefined;
}

export function hashAttemptId(attemptId: string): string {
  return createHash('sha256').update('attempt:').update(attemptId).digest('hex');
}

export function attemptHashMatches(stored: string, attemptId: string): boolean {
  const expected = Buffer.from(hashAttemptId(attemptId));
  const actual = Buffer.from(stored);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function key(previousRefreshToken: string, attemptId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(previousRefreshToken), Buffer.from(attemptId), INFO, 32));
}

export function sealRecovery(
  tokenPair: RecoveredTokenPair,
  previousRefreshToken: string,
  attemptId: string,
  aad: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(previousRefreshToken, attemptId), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(JSON.stringify(tokenPair), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

/** Returns undefined for any tampering, wrong key or malformed envelope. */
export function openRecovery(
  sealed: string,
  previousRefreshToken: string,
  attemptId: string,
  aad: string,
): RecoveredTokenPair | undefined {
  try {
    const [version, iv, tag, body] = sealed.split('.');
    if (version !== 'v1' || !iv || !tag || !body) return undefined;
    const decipher = createDecipheriv('aes-256-gcm', key(previousRefreshToken, attemptId), Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain) as Partial<RecoveredTokenPair>;
    return typeof parsed.refreshToken === 'string' && typeof parsed.csrfToken === 'string'
      ? { refreshToken: parsed.refreshToken, csrfToken: parsed.csrfToken }
      : undefined;
  } catch {
    return undefined;
  }
}
