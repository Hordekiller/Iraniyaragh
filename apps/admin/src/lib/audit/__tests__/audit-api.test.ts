import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { listAuditLogs, queryString } from '../audit-api';

const response = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;

const callsOf = (fetcher: ReturnType<typeof vi.fn>) => fetcher.mock.calls as unknown as [string, RequestInit][];

describe('audit Admin HTTP adapter', () => {
  afterEach(() => { vi.unstubAllGlobals(); setAccessToken(null); });

  it('reads the flat log with staff auth and the bounded default page', async () => {
    setAccessToken('staff-token');
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await listAuditLogs({ offset: 0, limit: 25 });
    const [url, init] = callsOf(fetcher)[0];
    expect(url).toBe('http://localhost:4000/api/v1/audit/admin/logs?offset=0&limit=25');
    expect(init.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer staff-token' }));
  });

  it('serializes every supported filter and keeps date values readable', async () => {
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await listAuditLogs({ offset: 10, limit: 50, action: 'order.paid', entityType: 'order', entityId: 'ord/1', createdFrom: '2026-09-01', createdToExclusive: '2026-09-30' });
    expect(callsOf(fetcher)[0][0]).toBe(
      'http://localhost:4000/api/v1/audit/admin/logs?offset=10&limit=50&action=order.paid&entityType=order&entityId=ord%2F1&createdFrom=2026-09-01&createdToExclusive=2026-09-30',
    );
  });

  it('uses GET and never sends a body', async () => {
    const fetcher = vi.fn(async () => response({ items: [], count: 0 }));
    vi.stubGlobal('fetch', fetcher);
    await listAuditLogs({ offset: 0, limit: 25 });
    const [, init] = callsOf(fetcher)[0];
    expect(init.method ?? 'GET').toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('keeps the query string ordered and bounded even with empty filters', () => {
    expect(queryString({})).toBe('');
    expect(queryString({ offset: 0, limit: 25, action: '', entityId: ' ', actorId: undefined })).toBe('offset=0&limit=25');
  });
});