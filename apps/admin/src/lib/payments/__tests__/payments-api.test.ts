import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { getPayment, listPayments } from '../payments-api';

function response(data: unknown): Response {
  return { ok: true, status: 200, text: vi.fn(async () => JSON.stringify({ data })) } as unknown as Response;
}

describe('admin payments API client', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('uses the staff payment endpoint with filters and bearer token', async () => {
    setAccessToken('staff-token');
    const fetchMock = vi.fn(async () => response({ items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } }));
    vi.stubGlobal('fetch', fetchMock);
    await listPayments({ page: 1, perPage: 25, status: 'PAID', search: 'IR-1001' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe('/api/v1/payments/admin');
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ page: '1', perPage: '25', status: 'PAID', search: 'IR-1001' });
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token' }));
  });

  it('encodes the payment id and unwraps detail', async () => {
    const fetchMock = vi.fn(async () => response({ payment: { id: 'payment/1' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(getPayment('payment/1')).resolves.toEqual({ id: 'payment/1' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain('/payments/admin/payment%2F1');
  });
});
