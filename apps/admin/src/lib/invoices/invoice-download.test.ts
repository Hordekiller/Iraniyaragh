import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '@/lib/auth/token-store';
import { downloadInvoicePdfArtifact } from './invoice-documents-api';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); setAccessToken(null); });
describe('private binary download diagnostics', () => {
  it('preserves verified artifact bytes/headers and forwards an opaque ID with authentication', async () => {
    setAccessToken('synthetic-token');
    const fetcher = vi.fn(async () => new Response('synthetic-pdf-bytes', { headers: { 'X-Request-ID': 'binary-response', 'X-Content-SHA256': 'a'.repeat(64), 'Content-Disposition': 'attachment; filename="synthetic.pdf"' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await downloadInvoicePdfArtifact('synthetic-id');
    expect(result).toMatchObject({ sha256: 'a'.repeat(64), byteCount: 19, filename: 'synthetic.pdf' });
    expect(new TextDecoder().decode(result.bytes)).toBe('synthetic-pdf-bytes');
    const headers = new Headers((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(headers.get('authorization')).toBe('Bearer synthetic-token');
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/u);
  });
  it('refuses missing authentication without a request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(downloadInvoicePdfArtifact('synthetic')).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains proxy status/reference when an upstream error is HTML', async () => {
    setAccessToken('synthetic-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>synthetic-private</html>', { status: 502, headers: { 'X-Request-ID': 'binary-proxy' } })));
    await expect(downloadInvoicePdfArtifact('synthetic')).rejects.toMatchObject({ statusCode: 502, requestId: 'binary-proxy' });
  });
  it('retains the API envelope and a reference for network failures', async () => {
    setAccessToken('synthetic-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 'FORBIDDEN', message: 'Denied', requestId: 'binary-denied' }), { status: 403 })));
    await expect(downloadInvoicePdfArtifact('synthetic')).rejects.toMatchObject({ code: 'FORBIDDEN', requestId: 'binary-denied', statusCode: 403 });
    const log = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('synthetic-private'); }));
    await expect(downloadInvoicePdfArtifact('synthetic')).rejects.toMatchObject({ kind: 'network', requestId: expect.stringMatching(/^[0-9a-f-]{36}$/u) });
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private');
  });
  it('preserves caller cancellation and bounds stalled response bodies', async () => {
    setAccessToken('synthetic-token');
    const cancelled = new AbortController(); cancelled.abort();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('Aborted', 'AbortError'); }));
    await expect(downloadInvoicePdfArtifact('synthetic', cancelled.signal)).rejects.toMatchObject({ name: 'ApiAbortError' });
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => ({ ok: true, status: 200, headers: new Headers({ 'X-Request-ID': 'binary-stalled' }), arrayBuffer: () => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) })));
    const rejection = expect(downloadInvoicePdfArtifact('synthetic')).rejects.toMatchObject({ kind: 'timeout', requestId: 'binary-stalled' });
    await vi.advanceTimersByTimeAsync(30000);
    await rejection;
  });
});
