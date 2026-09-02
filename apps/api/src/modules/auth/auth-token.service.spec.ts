import { Buffer } from 'node:buffer';
import jwt, { type JwtHeader, type JwtPayload } from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthRuntimeConfig } from './auth.config';
import { AuthTokenService, InvalidAccessTokenError } from './auth-token.service';

const NOW = new Date('2026-08-31T12:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const config: AuthRuntimeConfig = {
  accessSigningSecret: 'access-signing-secret-0123456789abcdef',
  issuer: 'iranyaragh-api-test',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: {
    version: 1,
    secret: 'hash-root-secret-0123456789abcdefghij',
  },
};

const baseClaims: JwtPayload = {
  iss: config.issuer,
  aud: config.audience,
  sub: 'user_opaque_id',
  sid: 'session_opaque_id',
  jti: '123e4567-e89b-42d3-a456-426614174000',
  iat: NOW_SECONDS,
  nbf: NOW_SECONDS,
  exp: NOW_SECONDS + 600,
  auth_time: NOW_SECONDS - 60,
  aal: 'STAFF_MFA',
  amr: ['pwd', 'totp'],
};

function signCustomToken(
  claims: JwtPayload,
  header: JwtHeader = { alg: 'HS256', typ: 'at+jwt' },
  secret = config.accessSigningSecret,
) {
  return jwt.sign(claims, secret, { algorithm: header.alg as 'HS256', header });
}

describe('AuthTokenService', () => {
  const service = new AuthTokenService(config);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues and strictly verifies a customer access token', () => {
    const token = service.signAccessToken({
      userId: 'customer-user-id',
      sessionId: 'customer-session-id',
      authenticationLevel: 'CUSTOMER_OTP',
      authenticatedAt: new Date(NOW.getTime() - 5_000),
    });

    const verified = service.verifyAccessToken(token);
    expect(verified).toMatchObject({
      userId: 'customer-user-id',
      sessionId: 'customer-session-id',
      authenticationLevel: 'CUSTOMER_OTP',
      authenticationMethods: ['sms'],
      authenticatedAtSeconds: NOW_SECONDS - 5,
      issuedAtSeconds: NOW_SECONDS,
      expiresAtSeconds: NOW_SECONDS + 600,
    });
    expect(verified.tokenId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(Object.isFrozen(verified)).toBe(true);
  });

  it('issues staff tokens with password and TOTP authentication methods only', () => {
    const token = service.signAccessToken({
      userId: 'staff-user-id',
      sessionId: 'staff-session-id',
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: NOW,
    });
    const decoded = jwt.decode(token, { complete: true });

    expect(decoded?.header).toEqual({ alg: 'HS256', typ: 'at+jwt' });
    expect(decoded?.payload).toMatchObject({
      aal: 'STAFF_MFA',
      amr: ['pwd', 'totp'],
    });
    expect(decoded?.payload).not.toHaveProperty('permissions');
    expect(decoded?.payload).not.toHaveProperty('roles');
    expect(decoded?.payload).not.toHaveProperty('email');
    expect(decoded?.payload).not.toHaveProperty('mobile');
  });

  it('rejects expired access tokens after the bounded clock tolerance', () => {
    const token = service.signAccessToken({
      userId: 'user-id',
      sessionId: 'session-id',
      authenticationLevel: 'CUSTOMER_OTP',
      authenticatedAt: NOW,
    });

    vi.setSystemTime(new Date(NOW.getTime() + 631_000));
    expect(() => service.verifyAccessToken(token)).toThrow(InvalidAccessTokenError);
  });

  it.each([
    ['wrong issuer', { ...baseClaims, iss: 'other-issuer' }, { alg: 'HS256', typ: 'at+jwt' }],
    ['wrong audience', { ...baseClaims, aud: 'other-audience' }, { alg: 'HS256', typ: 'at+jwt' }],
    ['wrong type', baseClaims, { alg: 'HS256', typ: 'JWT' }],
    ['unknown claim', { ...baseClaims, permissions: ['users.manage'] }, { alg: 'HS256', typ: 'at+jwt' }],
    ['unknown header', baseClaims, { alg: 'HS256', typ: 'at+jwt', kid: 'unexpected' }],
    ['missing session', { ...baseClaims, sid: undefined }, { alg: 'HS256', typ: 'at+jwt' }],
    ['invalid level', { ...baseClaims, aal: 'PASSWORD_ONLY' }, { alg: 'HS256', typ: 'at+jwt' }],
    ['invalid methods', { ...baseClaims, amr: ['pwd'] }, { alg: 'HS256', typ: 'at+jwt' }],
    ['extended lifetime', { ...baseClaims, exp: NOW_SECONDS + 601 }, { alg: 'HS256', typ: 'at+jwt' }],
    ['future auth time', { ...baseClaims, auth_time: NOW_SECONDS + 1 }, { alg: 'HS256', typ: 'at+jwt' }],
  ] as const)('rejects a signed token with %s', (_name, claims, header) => {
    expect(() => service.verifyAccessToken(signCustomToken(claims, header))).toThrow(InvalidAccessTokenError);
  });

  it('rejects token-selected algorithms and the wrong signing key', () => {
    const hs384 = jwt.sign(baseClaims, config.accessSigningSecret, {
      algorithm: 'HS384',
      header: { alg: 'HS384', typ: 'at+jwt' },
    });
    const wrongKey = signCustomToken(baseClaims, undefined, 'different-signing-secret-0123456789abc');

    expect(() => service.verifyAccessToken(hs384)).toThrow(InvalidAccessTokenError);
    expect(() => service.verifyAccessToken(wrongKey)).toThrow(InvalidAccessTokenError);
  });

  it.each(['', 'not-a-jwt', 'a'.repeat(4097)])('returns one non-leaking error for malformed input', token => {
    expect(() => service.verifyAccessToken(token)).toThrowError('Access token is invalid.');
  });

  it('rejects invalid signing inputs', () => {
    expect(() =>
      service.signAccessToken({
        userId: '',
        sessionId: 'session-id',
        authenticationLevel: 'CUSTOMER_OTP',
        authenticatedAt: NOW,
      }),
    ).toThrow(TypeError);
    expect(() =>
      service.signAccessToken({
        userId: 'user-id',
        sessionId: 'session-id',
        authenticationLevel: 'STAFF_MFA',
        authenticatedAt: new Date(NOW.getTime() + 1_000),
      }),
    ).toThrow(TypeError);
  });

  it('generates unique 256-bit refresh, CSRF and MFA challenge tokens', () => {
    const tokens = [service.generateRefreshToken(), service.generateCsrfToken(), service.generateMfaChallengeToken()];

    expect(new Set(tokens).size).toBe(3);
    for (const token of tokens) expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(service.generateTokenFamilyId()).toHaveLength(27);
  });

  it('compares CSRF cookie/header values safely and exactly', () => {
    const token = service.generateCsrfToken();
    expect(service.matchesCsrfToken(token, token)).toBe(true);
    expect(service.matchesCsrfToken(token, `${token}x`)).toBe(false);
    expect(service.matchesCsrfToken(token, token.slice(0, -1))).toBe(false);
    expect(service.matchesCsrfToken('same-non-token', 'same-non-token')).toBe(false);
    expect(service.matchesCsrfToken(undefined, token)).toBe(false);
  });
});
