import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthHttpClient } from './api';
import { MemorySessionStore } from './session-store';
import type { AccessTokenData } from './types';

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
});
