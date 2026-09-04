import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, ApiClientError, ApiNetworkError, getApiBaseUrl } from '../client';

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
  });

  it('sends GET to the API base URL with credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { ok: true } })));
    await apiFetch<{ ok: boolean }>('/health');
    expect(fetch).toHaveBeenCalledWith(`${getApiBaseUrl()}/api/v1/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: undefined,
      credentials: 'include',
    });
  });

  it('injects the Bearer token when provided', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/me', { token: 'at-1' });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer at-1' });
  });

  it('serializes the request body for POST', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: {} })));
    await apiFetch<Record<string, never>>('/auth/dev/signin', { method: 'POST', body: { code: 'x' } });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"code":"x"}');
  });

  it('returns the success envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: { accessToken: 'at' } })));
    const result = await apiFetch<{ accessToken: string }>('/auth/dev/signin');
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
    await expect(apiFetch<unknown>('/auth/dev/signin')).rejects.toMatchObject({
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

  it('produces an ApiClientError subclass of Error', () => {
    const error = new ApiClientError({ code: 'X', message: 'm', requestId: 'r', statusCode: 500 });
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('m');
  });
});
