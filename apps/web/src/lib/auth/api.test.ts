import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthHttpClient } from './api';
import { MemorySessionStore } from './session-store';
import type { AccessTokenData } from './types';

const stamp = '2026-09-01T00:00:00.000Z';

const accessData: AccessTokenData = {
  accessToken: 'access-token-kept-in-memory',
  tokenType: 'Bearer',
  expiresInSeconds: 600,
  principal: {
    userId: 'user-1',
    sessionId: 'session-1',
    authenticationLevel: 'CUSTOMER_OTP',
    permissions: [],
    authenticatedAt: '2026-09-01T00:00:00.000Z',
    accessExpiresAt: '2026-09-01T00:10:00.000Z',
  },
};

function okJson(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function fetchInit(call: unknown[]): RequestInit {
  return call[1] as RequestInit;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AuthHttpClient cookie-authenticated commands', () => {
  it('refreshes with POST, credentialed cookies, and double-submit CSRF proof', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson(accessData));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    const client = new AuthHttpClient({
      baseUrl: '/backend',
      store,
      getCsrfToken: () => 'csrf-proof',
    });

    await expect(client.refresh()).resolves.toEqual(accessData);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/refresh');
    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-proof');
    expect(store.getAccessToken()).toBe(accessData.accessToken);
  });

  it('logs out with POST and CSRF proof before clearing the memory store', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({
      store,
      getCsrfToken: () => 'csrf-proof',
    });

    await client.logout();

    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-proof');
    expect(store.isAuthenticated()).toBe(false);
  });

  it('fails closed without CSRF proof and does not make a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthHttpClient({
      store: new MemorySessionStore(),
      getCsrfToken: () => null,
    });

    await expect(client.refresh()).rejects.toMatchObject({
      code: 'AUTH_CSRF_INVALID',
      statusCode: 403,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requests a customer OTP challenge with the mobile payload', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    const challenge = { challengeId: 'c1', expiresInSeconds: 300, resendAfterSeconds: 60 };
    fetchMock.mockResolvedValue(okJson(challenge));
    vi.stubGlobal('fetch', fetchMock);
    const client = new AuthHttpClient({
      baseUrl: '/backend',
      store: new MemorySessionStore(),
      getCsrfToken: () => null,
    });

    await expect(
      client.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }),
    ).resolves.toEqual(challenge);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/customer/otp/request');
    expect(fetchInit(fetchMock.mock.calls[0]!)).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }),
    });
  });

  it('verifies a customer OTP and stores the access data in memory', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson(accessData));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    const client = new AuthHttpClient({
      baseUrl: '/backend',
      store,
      getCsrfToken: () => 'csrf-proof',
    });

    await expect(
      client.verifyOtp({ challengeId: 'c1', code: '123456' }),
    ).resolves.toEqual(accessData);

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/customer/otp/verify');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('resolves me() from the bearer-guarded principal payload', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({ principal: accessData.principal }));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ store, getCsrfToken: () => null });

    await expect(client.me()).resolves.toEqual(accessData.principal);

    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${accessData.accessToken}`,
    );
  });

  it('resolves listSessions() and rejects without a stored token', async () => {
    const sessions = [{ sessionId: 's1', createdAt: stamp, lastSeenAt: stamp }];
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({ sessions }));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ baseUrl: '/backend', store, getCsrfToken: () => null });

    await expect(client.listSessions()).resolves.toEqual(sessions);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/sessions');

    const anonymous = new AuthHttpClient({
      store: new MemorySessionStore(),
      getCsrfToken: () => null,
    });
    await expect(anonymous.listSessions()).rejects.toThrow(
      'Authenticated request requires an in-memory access token.',
    );
  });
  it('revokes another session with DELETE plus CSRF proof and keeps the caller signed in', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ baseUrl: '/backend', store, getCsrfToken: () => 'csrf-proof' });

    await client.revokeSession('other-session');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/sessions/other-session');
    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(init).toMatchObject({ method: 'DELETE', credentials: 'include' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-proof');
    // Revoking someone else's device must not sign this browser out.
    expect(store.getAccessToken()).toBe(accessData.accessToken);
  });

  it('drops the in-memory principal when this browser revokes its own session', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ store, getCsrfToken: () => 'csrf-proof' });

    await client.revokeSession('session-1');

    // The refresh cookie died with the session, so keeping the principal would
    // render a signed-in account with no usable credential.
    expect(store.getAccessToken()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('percent-encodes a session id and refuses an empty one without a request', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ baseUrl: '/backend', store, getCsrfToken: () => 'csrf-proof' });

    await client.revokeSession('a/../b');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/sessions/a%2F..%2Fb');

    fetchMock.mockClear();
    await expect(client.revokeSession('   ')).rejects.toThrow('Revoking a session requires a sessionId.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('revokes the whole session family with POST, CSRF proof and the bearer token', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ baseUrl: '/backend', store, getCsrfToken: () => 'csrf-proof' });

    await client.logoutAll();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/backend/api/v1/auth/logout-all');
    const init = fetchInit(fetchMock.mock.calls[0]!);
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-proof');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer access-token-kept-in-memory');
    expect(store.isAuthenticated()).toBe(false);
  });

  it('fails closed for logout-all without CSRF proof and leaves the session intact', async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
    fetchMock.mockResolvedValue(okJson({}));
    vi.stubGlobal('fetch', fetchMock);
    const store = new MemorySessionStore();
    store.setAuthenticated(accessData);
    const client = new AuthHttpClient({ store, getCsrfToken: () => null });

    await expect(client.logoutAll()).rejects.toMatchObject({ code: 'AUTH_CSRF_INVALID' });
    expect(fetchMock).not.toHaveBeenCalled();
    // A rejected request must never look like a completed logout.
    expect(store.isAuthenticated()).toBe(true);
  });
});
