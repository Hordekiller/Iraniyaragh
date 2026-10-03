import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { ApiClientError } from '@/lib/api/client';
import { changeStock, listBalances, listMovements } from '../ledger-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

describe('inventory ledger Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('reads raw, filtered and bounded balance/movement contracts with staff auth', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await listBalances({ warehouseId: 'wh/1', variantId: 'v-1', offset: 25, limit: 25 }, signal)).toEqual({ items: [], count: 0 });
    expect(await listMovements({ locationId: 'loc-1', type: 'ADJUSTMENT_OUT', offset: 0, limit: 10 }, signal)).toEqual({ items: [], count: 0 });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/inventory/balances?warehouseId=wh%2F1&variantId=v-1&offset=25&limit=25');
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/inventory/movements?locationId=loc-1&type=ADJUSTMENT_OUT&offset=0&limit=10');
    expect(calls[0][1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal), headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }) }));
  });

  it('posts only the explicit stock command with a stable idempotency header', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ id: 'movement-1' }));
    vi.stubGlobal('fetch', fetcher);
    const input = { warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'v-1', type: 'ADJUSTMENT_OUT' as const, delta: -2, reason: 'Count correction', expectedVersion: 4 };
    expect(await changeStock(input, 'inventory-change-1')).toEqual({ id: 'movement-1' });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/v1/inventory/changes');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body as string)).toEqual(input);
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token', 'Idempotency-Key': 'inventory-change-1' }));
  });

  it('preserves a backend authorization denial rather than treating it as an empty ledger', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 403, headers: new Headers(),
      text: async () => JSON.stringify({ code: 'FORBIDDEN', message: 'Denied', requestId: 'r-1', statusCode: 403 }),
    } as Response)));
    await expect(listBalances({ offset: 0, limit: 25 })).rejects.toMatchObject({ name: 'ApiClientError', code: 'FORBIDDEN', statusCode: 403 } satisfies Partial<ApiClientError>);
  });
});
