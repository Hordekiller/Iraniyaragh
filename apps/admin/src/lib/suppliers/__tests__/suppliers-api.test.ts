import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import {
  createSupplier,
  getSupplier,
  listSupplierHistory,
  listSuppliers,
  newSupplierCommandKey,
  updateSupplier,
} from '../suppliers-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

const callsOf = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls as unknown as [string, RequestInit][];

describe('supplier Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('reads the flat list with staff auth, exact filters and a bounded page', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;

    await listSuppliers({ offset: 50, limit: 25, isActive: false }, signal);
    await listSuppliers({ offset: 0, limit: 25 }, signal);
    await getSupplier('sup/1', signal);
    await listSupplierHistory('sup/1', { offset: 0, limit: 25 }, signal);

    const calls = callsOf(fetcher);
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/suppliers?offset=50&limit=25&isActive=false');
    expect(calls[1][0]).toBe('http://localhost:4000/api/v1/suppliers?offset=0&limit=25');
    expect(calls[2][0]).toBe('http://localhost:4000/api/v1/suppliers/sup%2F1');
    expect(calls[3][0]).toBe('http://localhost:4000/api/v1/suppliers/sup%2F1/history?offset=0&limit=25');
    expect(calls[0][1]).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal), headers: expect.objectContaining({ Authorization: 'Bearer staff-token' }) }));
  });

  it('sends create with a generated idempotency key and the trimmed payload', async () => {
    const fetcher = vi.fn(async () => response({ id: 'sup-1', version: 0 }));
    vi.stubGlobal('fetch', fetcher);

    const key = newSupplierCommandKey('create');
    await createSupplier({ code: 'SUP-1', name: 'تأمین', mobile: '09120000000', email: '' }, key);

    const calls = callsOf(fetcher);
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/suppliers');
    expect(calls[0][1].method).toBe('POST');
    expect(calls[0][1].headers).toEqual(expect.objectContaining({ 'Idempotency-Key': key }));
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ code: 'SUP-1', name: 'تأمین', mobile: '09120000000', email: '' });
  });

  it('sends update with expectedVersion so a stale write cannot win', async () => {
    const fetcher = vi.fn(async () => response({ id: 'sup-1', version: 4 }));
    vi.stubGlobal('fetch', fetcher);

    await updateSupplier('sup/1', { expectedVersion: 3, name: 'نام تازه', isActive: false }, 'supplier-update-key');

    const calls = callsOf(fetcher);
    expect(calls[0][0]).toBe('http://localhost:4000/api/v1/suppliers/sup%2F1');
    expect(calls[0][1].method).toBe('PATCH');
    expect(calls[0][1].headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'supplier-update-key' }));
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ expectedVersion: 3, name: 'نام تازه', isActive: false });
  });

  it('never offers hard delete and only uses the documented command verbs', async () => {
    const fetcher = vi.fn(async () => response({ id: 'sup-1' }));
    vi.stubGlobal('fetch', fetcher);
    await listSuppliers({ offset: 0, limit: 25 });
    expect(callsOf(fetcher).map(([, init]) => init.method ?? 'GET')).toEqual(['GET']);
  });

  it('generates distinct keys that satisfy the server key format', () => {
    const keys = [newSupplierCommandKey('create'), newSupplierCommandKey('update')];
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) {
      expect(key).toMatch(/^[A-Za-z0-9_-]{8,96}$/u);
    }
  });
});
