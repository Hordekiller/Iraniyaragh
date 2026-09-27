import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, setAccessToken } from '@/lib/auth/token-store';
import { createLocation, createWarehouse, listLocations, listWarehouses, updateLocation, updateWarehouse } from '../warehouses-api';

const baseUrl = 'http://localhost:4000/api/v1/inventory';
const response = (data: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) }) as Response;

describe('warehouse Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('sends bounded paginated reads with staff bearer auth and an abort signal', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await listWarehouses({ offset: 25, limit: 25, isInactive: true }, signal)).toEqual({ items: [], count: 0 });
    expect(await listLocations('warehouse/1', { offset: 0, limit: 50 }, signal)).toEqual({ items: [], count: 0 });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe(`${baseUrl}/warehouses?offset=25&limit=25&isInactive=true`);
    expect(calls[1][0]).toBe(`${baseUrl}/warehouses/warehouse%2F1/locations?offset=0&limit=50`);
    expect(calls[0][1]).toEqual(expect.objectContaining({
      method: 'GET', signal, headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }),
    }));
    expect(getAccessToken()).toBe('staff-token');
  });

  it('uses the exact protected create/update routes and request bodies', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ id: 'record-1' }));
    vi.stubGlobal('fetch', fetcher);
    expect(await createWarehouse({ code: 'WH-1', name: 'انبار مرکزی' })).toEqual({ id: 'record-1' });
    expect(await updateWarehouse('warehouse/1', { name: 'انبار ۲', isActive: false })).toEqual({ id: 'record-1' });
    expect(await createLocation('warehouse/1', { code: 'A-1', name: 'ردیف الف' })).toEqual({ id: 'record-1' });
    expect(await updateLocation('location/1', { name: 'ردیف ب', isActive: true })).toEqual({ id: 'record-1' });
    const calls = fetcher.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url]) => url)).toEqual([
      `${baseUrl}/warehouses`, `${baseUrl}/warehouses/warehouse%2F1`,
      `${baseUrl}/warehouses/warehouse%2F1/locations`, `${baseUrl}/locations/location%2F1`,
    ]);
    expect(calls.map(([, init]) => init.method)).toEqual(['POST', 'PATCH', 'POST', 'PATCH']);
    expect(calls.map(([, init]) => JSON.parse(init.body as string))).toEqual([
      { code: 'WH-1', name: 'انبار مرکزی' },
      { name: 'انبار ۲', isActive: false },
      { code: 'A-1', name: 'ردیف الف' },
      { name: 'ردیف ب', isActive: true },
    ]);
    for (const [, init] of calls) expect((init.headers as Record<string, string>).Authorization).toBe('Bearer staff-token');
  });
});
