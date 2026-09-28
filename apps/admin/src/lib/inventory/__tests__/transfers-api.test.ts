import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { createTransfer, getTransfer, listTransfers, transitionTransfer } from '../transfers-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

describe('transfer Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('reads bounded raw list and detail with staff auth and exact filters', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    await listTransfers({ status: 'REQUESTED', sourceWarehouseId: 'wh/1', offset: 25, limit: 25 }, signal);
    await getTransfer('tr/1', signal);
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/inventory/transfers?status=REQUESTED&sourceWarehouseId=wh%2F1&offset=25&limit=25');
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/inventory/transfers/tr%2F1');
    expect(calls[0][1]).toEqual(expect.objectContaining({ signal, headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }) }));
  });

  it('sends create items and versioned transition with distinct idempotency keys', async () => {
    const fetcher = vi.fn(async () => response({ id: 'tr-1', status: 'REQUESTED' }));
    vi.stubGlobal('fetch', fetcher);
    const input = { sourceWarehouseId: 'wh-1', targetWarehouseId: 'wh-2', items: [{ variantId: 'sku-1', quantity: 2, sourceLocationId: 'loc-1', targetLocationId: 'loc-2' }] };
    await createTransfer(input, 'transfer-create-1');
    await transitionTransfer('tr/1', 'request', { expectedVersion: 0 }, 'transfer-request-1');
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(JSON.parse(calls[0][1].body as string)).toEqual(input);
    expect(calls[0][1].headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'transfer-create-1' }));
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/inventory/transfers/tr%2F1/request');
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ expectedVersion: 0 });
    expect(calls[1][1].headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'transfer-request-1' }));
  });
});
