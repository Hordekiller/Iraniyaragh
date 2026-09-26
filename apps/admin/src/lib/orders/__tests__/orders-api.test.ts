import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { getOrder, getPicks, listOrders, markReady, recordPick, startFulfillment } from '../orders-api';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

type FetchCall = [string, RequestInit];
const baseUrl = ['http:', '', 'localhost:4000'].join('/') + '/api/v1';

describe('orders admin api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it('maps the view query to the exact admin order API query', async () => {
    setAccessToken('staff-access-token');
    const fetchMock = vi.fn(async () => jsonResponse({ data: { items: [], meta: { page: 2, perPage: 25, total: 0, pages: 0 } } }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await listOrders({
      page: 2,
      perPage: 25,
      search: 'IR-2026-1042',
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'PROCESSING',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-18T23:59:59.999Z',
      sortBy: 'grandTotal',
      sortDir: 'asc',
    }, controller.signal);

    const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${baseUrl}/orders/admin`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      page: '2',
      perPage: '25',
      search: 'IR-2026-1042',
      status: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'PROCESSING',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-18T23:59:59.999Z',
      sortBy: 'grandTotal',
      sortDir: 'asc',
    });
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-access-token' }));
    expect(init.signal).toBe(controller.signal);
  });

  it('fetches detail with an encoded id and unwraps the order', async () => {
    setAccessToken('staff-access-token');
    const order = { id: 'order/unsafe', number: 'IR-2026-1042' };
    const fetchMock = vi.fn(async () => jsonResponse({ data: { order } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getOrder('order/unsafe')).resolves.toEqual(order);

    const [url, init] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(url).toBe(`${baseUrl}/orders/admin/order%2Funsafe`);
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-access-token' }));
  });

  it('omits absent optional filters', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: { items: [], meta: { page: 1, perPage: 25, total: 0, pages: 0 } } }));
    vi.stubGlobal('fetch', fetchMock);

    await listOrders({ page: 1, perPage: 25, sortBy: 'createdAt', sortDir: 'desc' });

    const [url] = fetchMock.mock.calls[0] as unknown as FetchCall;
    expect(url).toBe(`${baseUrl}/orders/admin?page=1&perPage=25&sortBy=createdAt&sortDir=desc`);
  });

  it('reads pick proof and sends the exact item quantity with a stable retry key', async () => {
    setAccessToken('staff-access-token');
    const fetchMock = vi.fn(async () => jsonResponse({ data: { fulfillment: { id: 'f1', status: 'PROCESSING' }, items: [] } }));
    vi.stubGlobal('fetch', fetchMock);
    await getPicks('order/1');
    await recordPick('order/1', 'item/2', 3, 'retry-key');
    const [readUrl] = fetchMock.mock.calls[0] as unknown as FetchCall;
    const [writeUrl, writeInit] = fetchMock.mock.calls[1] as unknown as FetchCall;
    expect(readUrl).toBe(`${baseUrl}/orders/admin/order%2F1/fulfillment/picks`);
    expect(writeUrl).toBe(`${baseUrl}/orders/admin/order%2F1/fulfillment/items/item%2F2/pick`);
    expect(writeInit).toMatchObject({ method: 'POST', body: '{"quantity":3}' });
    expect(writeInit.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-access-token', 'Idempotency-Key': 'retry-key' }));
  });

  it('sends both guarded fulfillment transitions with the supplied retry key', async () => {
    setAccessToken('staff-access-token');
    const fetchMock = vi.fn(async () => jsonResponse({ data: { fulfillment: { id: 'f1' } } }));
    vi.stubGlobal('fetch', fetchMock);
    await startFulfillment('order-1', 'start-key');
    await markReady('order-1', 'ready-key');
    const [startUrl, startInit] = fetchMock.mock.calls[0] as unknown as FetchCall;
    const [readyUrl, readyInit] = fetchMock.mock.calls[1] as unknown as FetchCall;
    expect(startUrl).toBe(`${baseUrl}/orders/admin/order-1/fulfillment/start`);
    expect(readyUrl).toBe(`${baseUrl}/orders/admin/order-1/fulfillment/ready`);
    expect(startInit.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'start-key' }));
    expect(readyInit.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'ready-key' }));
  });
});
