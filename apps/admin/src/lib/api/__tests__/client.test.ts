import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiAbortError, ApiClientError, ApiNetworkError, getApiBaseUrl, readCsrfToken, registerSessionRecovery } from '../client';
import { setAccessToken } from '@/lib/auth/token-store';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('sends GET to the API base URL with credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { ok: true } })));
    await apiFetch<{ ok: boolean }>('/health');
    expect(fetch).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/v1/health`, expect.objectContaining({
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
      credentials: 'include',
      cache: 'no-store',
      signal: expect.any(AbortSignal),
    }));
  });

  it('injects the Bearer token when provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/me', { token: 'at-1' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer at-1' });
  });

  it('serializes the request body for POST', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/staff/password', { method: 'POST', body: { identifier: 'x' } });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"identifier":"x"}');
  });

  it('reads the double-submit CSRF cookie for cookie-authenticated calls', () => {
    const document = { cookie: 'other=1; __Host-iranyaragh_csrf=csrftoken-abc' } as unknown as Document;
    expect(readCsrfToken(document)).toBe('csrftoken-abc');
  });

  it('reads the development customer/staff CSRF cookie issued by real sign-in', () => {
    const document = { cookie: 'other=1; iranyaragh_customer_csrf=customer-csrf-4' } as unknown as Document;
    expect(readCsrfToken(document)).toBe('customer-csrf-4');
  });

  it('returns null when no CSRF cookie is set', () => {
    expect(readCsrfToken({ cookie: 'other=1' } as unknown as Document)).toBeNull();
    expect(readCsrfToken(undefined as unknown as Document)).toBeNull();
  });

  it('sends X-CSRF-Token on state-changing requests when a CSRF cookie exists', async () => {
    vi.stubGlobal('document', { cookie: '__Host-iranyaragh_csrf=csrftoken-abc' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-CSRF-Token': 'csrftoken-abc' });
  });

  it('does not attach X-CSRF-Token when no CSRF cookie is readable', async () => {
    vi.stubGlobal('document', { cookie: 'other=1' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/logout', { method: 'POST' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('X-CSRF-Token');
  });

  it('returns the success envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { accessToken: 'at' } })));
    const result = await apiFetch<{ accessToken: string }>('/auth/staff/totp/verify');
    expect(result.data.accessToken).toBe('at');
  });

  it('throws ApiClientError with code on an error envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          jsonResponse({ code: 'AUTH_INVALID_CREDENTIALS', message: 'bad', requestId: 'r1', statusCode: 401 }, false, 401),
      ),
    );
    await expect(apiFetch<unknown>('/auth/staff/password')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'AUTH_INVALID_CREDENTIALS',
      statusCode: 401,
    });
  });

  it('throws ApiNetworkError when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(apiFetch<unknown>('/auth/me')).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('throws ApiNetworkError when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('boom'))));
    await expect(apiFetch<unknown>('/auth/me')).rejects.toBeInstanceOf(ApiNetworkError);
  });

  it('forwards the abort signal and throws ApiAbortError when already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const seenSignalRef = {} as { signal?: AbortSignal | null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        seenSignalRef.signal = init?.signal;
        if (init?.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
        return jsonResponse({ data: {} });
      }),
    );
    await expect(apiFetch<unknown>('/health', { signal: controller.signal })).rejects.toBeInstanceOf(
      ApiAbortError,
    );
    expect(seenSignalRef.signal?.aborted).toBe(true);
  });

  it('throws ApiAbortError when fetch rejects with an aborted signal', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        controller.abort();
        throw new DOMException('The operation was aborted.', 'AbortError');
      }),
    );
    await expect(apiFetch<unknown>('/health', { signal: controller.signal })).rejects.toBeInstanceOf(
      ApiAbortError,
    );
  });

  it('produces an ApiClientError subclass of Error', () => {
    const error = new ApiClientError({ code: 'X', message: 'm', requestId: 'r', statusCode: 500 });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('m');
  });

  it('coalesces simultaneous expired-token requests and replays the exact mutation only once', async () => {
    setAccessToken('old');
    const recovery = vi.fn(async () => { setAccessToken('fresh', true); return 'fresh'; });
    const unregister = registerSessionRecovery(recovery);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer old'
        ? jsonResponse({ code: 'AUTH_SESSION_INVALID', message: 'expired', statusCode: 401 }, false, 401)
        : jsonResponse({ data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await Promise.all([1, 2].map(() => apiFetch('/catalog/admin/products', {
        method: 'POST', token: 'old', body: { name: 'draft' }, headers: { 'Idempotency-Key': 'same-key' },
      })));
      expect(recovery).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      for (const [, init] of fetchMock.mock.calls) {
        expect(init.body).toBe('{"name":"draft"}');
        expect(init.headers).toMatchObject({ 'Idempotency-Key': 'same-key' });
      }
    } finally { unregister(); }
  });

  it('fails closed on revoked refresh and never retries the protected mutation', async () => {
    const failure = new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: 'r', statusCode: 401 });
    const unregister = registerSessionRecovery(async () => { throw failure; });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ code: failure.code, statusCode: 401 }, false, 401)));
    try {
      await expect(apiFetch('/catalog/admin/products', { token: 'old' })).rejects.toBe(failure);
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { unregister(); }
  });

  it('does not replay a late 401 after logout or a different login', async () => {
    setAccessToken('old');
    const recovery = vi.fn(async () => 'fresh');
    const unregister = registerSessionRecovery(recovery);
    vi.stubGlobal('fetch', vi.fn(async () => {
      setAccessToken('another-user');
      return jsonResponse({ code: 'AUTH_SESSION_INVALID', statusCode: 401 }, false, 401);
    }));
    try {
      await expect(apiFetch('/catalog/admin/products', { token: 'old' })).rejects.toBeInstanceOf(ApiAbortError);
      expect(recovery).not.toHaveBeenCalled();
    } finally { unregister(); }
  });

  it('does not loop when the refreshed token is rejected too', async () => {
    setAccessToken('old');
    const recovery = vi.fn(async () => { setAccessToken('fresh', true); return 'fresh'; });
    const unregister = registerSessionRecovery(recovery);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ code: 'AUTH_SESSION_INVALID', statusCode: 401 }, false, 401)));
    try {
      await expect(apiFetch('/catalog/admin/products', { token: 'old' })).rejects.toBeInstanceOf(ApiClientError);
      expect(recovery).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally { unregister(); }
  });

  it('uses the already rotated token for a late 401 without rotating cookies again', async () => {
    setAccessToken('old');
    const recovery = vi.fn(async () => 'unnecessary');
    const unregister = registerSessionRecovery(recovery);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      if ((init.headers as Record<string, string>).Authorization === 'Bearer old') {
        setAccessToken('already-fresh', true);
        return jsonResponse({ code: 'AUTH_SESSION_INVALID', statusCode: 401 }, false, 401);
      }
      return jsonResponse({ data: { ok: true } });
    }));
    try {
      await expect(apiFetch('/catalog/admin/products', { token: 'old' })).resolves.toEqual({ data: { ok: true } });
      expect(recovery).not.toHaveBeenCalled();
    } finally { unregister(); }
  });
});
