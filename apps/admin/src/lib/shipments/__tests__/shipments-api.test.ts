import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { getShipment, listShipments } from '../shipments-api';

const response = (body: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

const callsOf = (fetcher: ReturnType<typeof vi.fn>) =>
  fetcher.mock.calls as unknown as [string, RequestInit][];

const meta = { page: 1, perPage: 10, total: 0, pages: 0 };

describe('shipments Admin HTTP adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('reads the shipment list with staff auth and a bounded default query', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ data: { items: [], meta } }));
    vi.stubGlobal('fetch', fetcher);

    await expect(listShipments({ page: 1, perPage: 10 })).resolves.toEqual({ items: [], meta });

    const [url, init] = callsOf(fetcher)[0];
    expect(url).toBe('http://localhost:4000/api/v1/shipments/admin?page=1&perPage=10');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token' }));
  });

  it('serializes every supported filter and keeps the sort contract intact', async () => {
    const fetcher = vi.fn(async () => response({ data: { items: [], meta } }));
    vi.stubGlobal('fetch', fetcher);

    await listShipments({
      page: 2,
      perPage: 25,
      status: 'SHIPPED',
      carrier: 'post',
      trackingCode: 'TRK/9',
      dispatchedFrom: '2026-09-01',
      dispatchedTo: '2026-09-29',
      sortBy: 'carrier',
      sortDir: 'asc',
    });

    expect(callsOf(fetcher)[0][0]).toBe(
      'http://localhost:4000/api/v1/shipments/admin?page=2&perPage=25&status=SHIPPED' +
        '&carrier=post&trackingCode=TRK%2F9&dispatchedFrom=2026-09-01&dispatchedTo=2026-09-29' +
        '&sortBy=carrier&sortDir=asc',
    );
  });

  it('drops empty filters so the request never sends blank values', async () => {
    const fetcher = vi.fn(async () => response({ data: { items: [], meta } }));
    vi.stubGlobal('fetch', fetcher);

    await listShipments({ page: 1, perPage: 10, status: undefined, carrier: '', trackingCode: '' });

    expect(callsOf(fetcher)[0][0]).toBe('http://localhost:4000/api/v1/shipments/admin?page=1&perPage=10');
  });

  it('uses GET and never sends a body', async () => {
    const fetcher = vi.fn(async () => response({ data: { items: [], meta } }));
    vi.stubGlobal('fetch', fetcher);

    await listShipments({ page: 1, perPage: 10 });
    const [, init] = callsOf(fetcher)[0];

    expect(init.method ?? 'GET').toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('unwraps the shipment detail payload and escapes the id segment', async () => {
    const shipment = { id: 'ship/1', orderId: 'order-1', orderNumber: 'IR-2026-1', status: 'SHIPPED', carrier: 'post', trackingCode: 'TRK1', itemCount: 1, totalQuantity: 2, city: 'تهران', customer: { id: 'c1', displayNameMasked: null, mobileMasked: '0912*****67' }, dispatchedAt: '2026-09-20T10:00:00.000Z', address: null, dispatchedBy: null, lines: [] };
    const fetcher = vi.fn(async () => response({ data: { shipment } }));
    vi.stubGlobal('fetch', fetcher);

    await expect(getShipment('ship/1')).resolves.toEqual(shipment);
    expect(callsOf(fetcher)[0][0]).toBe('http://localhost:4000/api/v1/shipments/admin/ship%2F1');
  });
});
