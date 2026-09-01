import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonRequest } from './request';

function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

function fetchInit(call: unknown[]): RequestInit | undefined {
  return call[1] as unknown as RequestInit | undefined;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function okJson<T>(data: T): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('jsonRequest', () => {
  it('returns the flat { data } success envelope', async () => {
    stubFetch(() => okJson({ challengeId: 'c1', expiresInSeconds: 300, resendAfterSeconds: 60 }));
    const result = await jsonRequest<{ challengeId: string }>('/api/v1/auth/customer/otp/request', {
      json: { mobile: '+989123456789', client: 'CUSTOMER_WEB' },
    });
    expect(result.data).toEqual({ challengeId: 'c1', expiresInSeconds: 300, resendAfterSeconds: 60 });
  });

  it('throws AuthApiError on a non-2xx envelope', async () => {
    stubFetch(() =>
      new Response(
        JSON.stringify({ code: 'AUTH_CHALLENGE_INVALID', message: 'bad', statusCode: 401 }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(jsonRequest('/x')).rejects.toMatchObject({
      name: 'AuthApiError',
      code: 'AUTH_CHALLENGE_INVALID',
      statusCode: 401,
    });
  });

  it('sets the Authorization Bearer header when an access token is supplied', async () => {
    const fetchMock = vi.fn(() => okJson({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await jsonRequest('/api/v1/auth/me', {
      accessToken: 'at-secret',
      headers: { 'X-Extra': '1' },
    });
    const init = fetchInit(fetchMock.mock.calls[0])!;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-secret');
  });

  it('uses POST + JSON body for payload requests and GET otherwise', async () => {
    const fetchMock = vi.fn(() => okJson({ done: true }));
    vi.stubGlobal('fetch', fetchMock);

    await jsonRequest('/api/v1/auth/customer/otp/verify', {
      json: { challengeId: 'c1', code: '123456' },
    });
    const withBody = fetchInit(fetchMock.mock.calls[0])!;
    expect(withBody.method).toBe('POST');
    expect(withBody.body).toBe(JSON.stringify({ challengeId: 'c1', code: '123456' }));
    expect((withBody.headers as Record<string, string>)['Content-Type']).toBe('application/json');

    await jsonRequest('/api/v1/auth/me');
    const noBody = fetchInit(fetchMock.mock.calls[1])!;
    expect(noBody.method).toBe('GET');
  });

  it('sends credentials same-origin by default', async () => {
    const fetchMock = vi.fn(() => okJson({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await jsonRequest('/x');
    const init = fetchInit(fetchMock.mock.calls[0])!;
    expect(init.credentials).toBe('same-origin');
  });

  it('normalizes a fetch TypeError into NETWORK_ERROR', async () => {
    stubFetch(() => {
      throw new TypeError('failed to fetch');
    });
    await expect(jsonRequest('/x')).rejects.toMatchObject({
      name: 'AuthApiError',
      code: 'NETWORK_ERROR',
    });
  });

  it('normalizes an AbortError (timeout) into TIMEOUT', async () => {
    stubFetch((_url, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      });
    });
    await expect(
      jsonRequest('/x', { timeoutMs: 5 }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('treats a 2xx body without { data } as PARSE_ERROR', async () => {
    stubFetch(() => new Response(JSON.stringify({ hello: 'world' }), { status: 200 }));
    await expect(jsonRequest('/x')).rejects.toMatchObject({
      name: 'AuthApiError',
      code: 'PARSE_ERROR',
      statusCode: 200,
    });
  });
});
