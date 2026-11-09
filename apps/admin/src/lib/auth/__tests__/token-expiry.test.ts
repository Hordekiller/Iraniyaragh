import { describe, expect, it } from 'vitest';
import { accessTokenExpiresAt, accessTokenExpiresSoon } from '../token-expiry';

const jwt = (claims: Record<string, unknown>) => {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
};

describe('access token expiry', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  const at = (offsetSeconds: number) => Math.floor(now / 1000) + offsetSeconds;

  it('reads the exp claim in milliseconds', () => {
    expect(accessTokenExpiresAt(jwt({ exp: at(60) }))).toBe(at(60) * 1000);
  });

  it('flags expired and nearly expired tokens', () => {
    expect(accessTokenExpiresSoon(jwt({ exp: at(-5) }), now)).toBe(true);
    expect(accessTokenExpiresSoon(jwt({ exp: at(10) }), now)).toBe(true);
  });

  it('does not flag a token with comfortable lifetime', () => {
    expect(accessTokenExpiresSoon(jwt({ exp: at(300) }), now)).toBe(false);
  });

  it('never blocks on tokens it cannot read', () => {
    expect(accessTokenExpiresSoon('not-a-token', now)).toBe(false);
    expect(accessTokenExpiresSoon(jwt({}), now)).toBe(false);
    expect(accessTokenExpiresSoon('a.%%%.c', now)).toBe(false);
  });
});
