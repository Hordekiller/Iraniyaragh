import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { createPurchaseOrder, listPurchaseOrderOptions, listPurchaseOrders, newPurchaseOrderCommandKey, transitionPurchaseOrder, updatePurchaseOrder } from '../purchase-orders-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;
const callsOf = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls as unknown as [string, RequestInit][];

describe('purchase order Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });
  it('uses staff auth and bounded options', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await listPurchaseOrders({ offset: 25, limit: 25, status: 'DRAFT' });
    await listPurchaseOrderOptions('variant', 'ABC');
    const calls = callsOf(fetcher);
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/purchase-orders?offset=25&limit=25&status=DRAFT');
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/purchase-orders/options?kind=variant&search=ABC&offset=0&limit=50');
    expect(calls[0][1]).toEqual(expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }) }));
  });
  it('carries idempotency and version through mutations', async () => {
    const fetcher = vi.fn(async () => response({ id: 'po-1' }));
    vi.stubGlobal('fetch', fetcher);
    const key = newPurchaseOrderCommandKey();
    await createPurchaseOrder({ supplierId: 'sup-1', warehouseId: 'wh-1', items: [{ variantId: 'sku-1', orderedQty: 2, unitCost: '120000' }] }, key);
    await updatePurchaseOrder('po/1', { expectedVersion: 3, notes: 'edited' }, key);
    await transitionPurchaseOrder('po/1', 'approve', { expectedVersion: 4 }, key);
    expect(key).toMatch(/^[A-Za-z0-9_-]{8,96}$/u);
    const calls = callsOf(fetcher);
    expect(calls.map(([, init]) => init.method)).toEqual(['POST', 'PATCH', 'POST']);
    expect(calls[0][1].headers).toEqual(expect.objectContaining({ 'Idempotency-Key': key }));
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/purchase-orders/po%2F1');
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ expectedVersion: 4 });
  });
});
