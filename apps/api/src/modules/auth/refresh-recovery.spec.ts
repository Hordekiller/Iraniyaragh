import { describe, expect, it } from 'vitest';
import { attemptHashMatches, hashAttemptId, openRecovery, parseRefreshAttemptId, sealRecovery } from './refresh-recovery';

const credentials = { refreshToken: 'next-refresh-token', csrfToken: 'next-csrf' };
const attempt = 'AbCdEfGhIjKlMnOpQrStUv';

describe('refresh recovery sealing', () => {
  it('round-trips only with the same previous token, attempt and binding', () => {
    const sealed = sealRecovery(credentials, 'old-token', attempt, 'a>b');
    expect(openRecovery(sealed, 'old-token', attempt, 'a>b')).toEqual(credentials);
    expect(openRecovery(sealed, 'other-token', attempt, 'a>b')).toBeUndefined();
    expect(openRecovery(sealed, 'old-token', `${attempt}x`, 'a>b')).toBeUndefined();
    expect(openRecovery(sealed, 'old-token', attempt, 'a>c')).toBeUndefined();
  });
  it('never contains the plaintext credentials and rejects tampering/garbage', () => {
    const sealed = sealRecovery(credentials, 'old-token', attempt, 'a>b');
    expect(sealed).not.toContain('next-refresh-token');
    expect(sealed).not.toContain('next-csrf');
    const parts = sealed.split('.');
    parts[3] = Buffer.from('tampered').toString('base64url');
    expect(openRecovery(parts.join('.'), 'old-token', attempt, 'a>b')).toBeUndefined();
    expect(openRecovery('garbage', 'old-token', attempt, 'a>b')).toBeUndefined();
  });
  it('compares attempt hashes in constant time and validates the attempt format', () => {
    expect(attemptHashMatches(hashAttemptId(attempt), attempt)).toBe(true);
    expect(attemptHashMatches(hashAttemptId(attempt), `${attempt}x`)).toBe(false);
    expect(attemptHashMatches('short', attempt)).toBe(false);
    expect(parseRefreshAttemptId(attempt)).toBe(attempt);
    for (const bad of ['', 'short', 'has space has space has', 'x'.repeat(65), undefined, ['a'], 5]) expect(parseRefreshAttemptId(bad)).toBeUndefined();
  });
});
