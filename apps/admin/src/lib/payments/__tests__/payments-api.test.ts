import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { getPayment, listPayments, newRefundIdempotencyKey, reconcilePayment, refundPayment } from '../payments-api';

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

  it('posts recorded refund evidence with the idempotency key and no gateway authority', async () => {
    setAccessToken('staff-token');
    const fetchMock = vi.fn(async () => response({ refund: { refundId: 'refund-1', paymentId: 'payment/1' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      refundPayment('payment/1', {
        amountMinorUnits: '40000', gatewayReferenceId: 'ZR-1', reason: 'CUSTOMER_REQUEST',
      }, 'refund-key-1'),
    ).resolves.toMatchObject({ refundId: 'refund-1' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/payments/admin/payment%2F1/refund');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer staff-token',
      'Idempotency-Key': 'refund-key-1',
    }));
    expect(JSON.parse(init.body as string)).toEqual({
      amountMinorUnits: '40000', gatewayReferenceId: 'ZR-1', reason: 'CUSTOMER_REQUEST',
    });
    expect(JSON.stringify(init.body)).not.toMatch(/authority|status|refundedAmount/iu);
  });

  it('mints a distinct idempotency key per form', () => {
    expect(newRefundIdempotencyKey()).not.toBe(newRefundIdempotencyKey());
    expect(newRefundIdempotencyKey()).toMatch(/^refund-[0-9a-f-]{36}$/u);
  });

  it('posts a manually confirmed recheck without sending gateway authority', async () => {
    setAccessToken('staff-token');
    const fetchMock = vi.fn(async () => response({ reconciliation: { paymentId: 'payment/1', status: 'PENDING' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(reconcilePayment('payment/1')).resolves.toMatchObject({ paymentId: 'payment/1' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/payments/admin/payment%2F1/reconcile');
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token' }));
  });
});
