import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { createManualReservation, listReservations, transitionManualReservation } from '../reservations-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

describe('reservation Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('reads the raw filtered list with staff auth', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await listReservations({ warehouseId: 'wh/1', status: 'ACTIVE', offset: 25, limit: 25 })).toEqual({ items: [], count: 0 });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/v1/inventory/reservations?warehouseId=wh%2F1&status=ACTIVE&offset=25&limit=25');
    expect(options.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token' }));
  });

  it('creates only a manual reservation with the caller key and version', async () => {
    const fetcher = vi.fn(async () => response({ id: 'res-1' }));
    vi.stubGlobal('fetch', fetcher);
    const input = { warehouseId: 'wh-1', locationId: 'loc-1', variantId: 'sku-1', quantity: 2, expiresAt: '2030-01-01T00:00:00.000Z', expectedVersion: 4 };
    await createManualReservation(input, 'reserve-1');
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/v1/inventory/reservations');
    expect(JSON.parse(options.body as string)).toEqual(input);
    expect(options.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'reserve-1' }));
  });

  it('sends lifecycle version to the exact encoded reservation URL', async () => {
    const fetcher = vi.fn(async () => response({ id: 'res/1', status: 'RELEASED' }));
    vi.stubGlobal('fetch', fetcher);
    await transitionManualReservation('res/1', 'release', { expectedVersion: 7 });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:4000/api/v1/inventory/reservations/res%2F1/release');
    expect(JSON.parse(options.body as string)).toEqual({ expectedVersion: 7 });
  });
});
