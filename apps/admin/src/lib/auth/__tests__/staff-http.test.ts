import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { StaffAuthError } from '../staff-api';
import { createMemoryStaffTokenStore } from '../token-store';
import { StaffAuthFixtureClient } from '../staff-fixture';
import { createStaffAuth, StaffAuthHttpClient } from '../staff-http';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [])) as never,
  };
});

function errorEnvelope(code: string, statusCode = 400, message = `msg-${code}`) {
  return { code, message, requestId: 'r1', statusCode };
}

function mockEnvelope(code: string, statusCode = 400): void {
  apiFetchMock.mockRejectedValueOnce(new ApiClientError(errorEnvelope(code, statusCode)));
}

const PRINCIPAL = {
  userId: 'u1',
  sessionId: 's1',
  authenticationLevel: 'STAFF_MFA' as const,
  permissions: ['admin.dashboard.read'],
  authenticatedAt: '2026-09-13T00:00:00.000Z',
  accessExpiresAt: '2026-09-13T00:10:00.000Z',
};

describe('StaffAuthHttpClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const store = createMemoryStaffTokenStore();
  const client = new StaffAuthHttpClient({ store });

  it('requests a password challenge from /auth/staff/password', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: { challengeToken: 'ct-1', next: 'TOTP', expiresInSeconds: 300 },
    });
    const result = await client.passwordRequest({ identifier: 'ops', password: 'pw' });
    expect(result).toEqual({ challengeToken: 'ct-1', next: 'TOTP', expiresInSeconds: 300 });
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/staff/password', {
      method: 'POST',
      body: { identifier: 'ops', password: 'pw' },
    });
  });

  it('verifies the TOTP code and keeps the access token in the in-memory store', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: { accessToken: 'at-1', tokenType: 'Bearer', expiresInSeconds: 600, principal: PRINCIPAL },
    });
    const result = await client.totpVerify({ challengeToken: 'ct-1', code: '123456' });
    expect(result.accessToken).toBe('at-1');
    expect(store.get()).toBe('at-1');
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/staff/totp/verify', {
      method: 'POST',
      body: { challengeToken: 'ct-1', code: '123456' },
    });
  });

  it('resolves the current principal from /auth/me with the stored token', async () => {
    store.set('at-1');
    apiFetchMock.mockResolvedValueOnce({ data: { principal: PRINCIPAL } });
    const principal = await client.me();
    expect(principal).toEqual(PRINCIPAL);
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/me', { token: 'at-1' });
  });

  it('sends no token on /auth/me when the store is empty', async () => {
    store.set(null);
    apiFetchMock.mockResolvedValueOnce({ data: { principal: PRINCIPAL } });
    await client.me();
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/me', { token: null });
  });

  it('posts to /auth/logout so the server can revoke the session', async () => {
    store.set('at-1');
    apiFetchMock.mockResolvedValueOnce({ data: {} });
    await expect(client.logout()).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/logout', { method: 'POST', token: 'at-1' });
  });

  it('stores the new access token after a fresh verify even when a token already existed', async () => {
    store.set('at-old');
    apiFetchMock.mockResolvedValueOnce({
      data: { accessToken: 'at-new', tokenType: 'Bearer', expiresInSeconds: 600, principal: PRINCIPAL },
    });
    await client.totpVerify({ challengeToken: 'ct-2', code: '654321' });
    expect(store.get()).toBe('at-new');
  });

  describe('error mapping', () => {
    it('passes through AUTH_INVALID_CREDENTIALS with its status', async () => {
      mockEnvelope('AUTH_INVALID_CREDENTIALS', 401);
      await expect(client.passwordRequest({ identifier: 'x', password: 'y' })).rejects.toMatchObject({
        name: 'StaffAuthError',
        code: 'AUTH_INVALID_CREDENTIALS',
        statusCode: 401,
      });
    });

    it('passes through AUTH_CHALLENGE_INVALID', async () => {
      mockEnvelope('AUTH_CHALLENGE_INVALID', 401);
      await expect(client.totpVerify({ challengeToken: 'c', code: '000000' })).rejects.toMatchObject({
        code: 'AUTH_CHALLENGE_INVALID',
      });
    });

    it('passes through RATE_LIMITED with the 429 status', async () => {
      mockEnvelope('RATE_LIMITED', 429);
      await expect(client.passwordRequest({ identifier: 'x', password: 'y' })).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        statusCode: 429,
      });
    });

    it('passes through AUTH_CSRF_INVALID from the logout path', async () => {
      mockEnvelope('AUTH_CSRF_INVALID', 403);
      await expect(client.logout()).rejects.toMatchObject({ code: 'AUTH_CSRF_INVALID', statusCode: 403 });
    });

    it('collapses unknown 4xx codes to an internal error', async () => {
      mockEnvelope('NOT_FOUND', 404);
      await expect(client.me()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 404 });
    });

    it('collapses 5xx codes to an upstream-unavailable error', async () => {
      mockEnvelope('INTERNAL_ERROR', 502);
      await expect(client.passwordRequest({ identifier: 'x', password: 'y' })).rejects.toMatchObject({
        code: 'UPSTREAM_UNAVAILABLE',
        statusCode: 502,
      });
    });

    it('maps network failures to an upstream-unavailable error', async () => {
      apiFetchMock.mockRejectedValueOnce(new ApiNetworkError('offline'));
      await expect(client.me()).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE', statusCode: 503 });
    });

    it('normalizes unexpected client errors to an internal error', async () => {
      apiFetchMock.mockRejectedValueOnce(new Error('boom'));
      await expect(client.me()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', statusCode: 500 });
    });

    it('produces StaffAuthError instances with the normalized shape', async () => {
      mockEnvelope('AUTH_SESSION_INVALID', 401);
      const error = await client.me().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StaffAuthError);
    });
  });
});

describe('createStaffAuth', () => {
  const original = process.env.NEXT_PUBLIC_FIXTURE_AUTH;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    } else {
      process.env.NEXT_PUBLIC_FIXTURE_AUTH = original;
    }
  });

  it('selects the deterministic fixture only when the build opts in', () => {
    process.env.NEXT_PUBLIC_FIXTURE_AUTH = 'true';
    const store = createMemoryStaffTokenStore();
    const resolved = createStaffAuth(store);
    expect(resolved.fixture).toBe(true);
    expect(resolved.api).toBeInstanceOf(StaffAuthFixtureClient);
  });

  it('defaults to the real HTTP client without the fixture opt-in', () => {
    delete process.env.NEXT_PUBLIC_FIXTURE_AUTH;
    const store = createMemoryStaffTokenStore();
    const resolved = createStaffAuth(store);
    expect(resolved.fixture).toBe(false);
    expect(resolved.api).toBeInstanceOf(StaffAuthHttpClient);
  });
});