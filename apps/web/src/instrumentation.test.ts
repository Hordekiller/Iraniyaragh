import { describe, expect, it, vi } from 'vitest';
import { onRequestError } from './instrumentation';
describe('storefront server diagnostic boundary', () => {
  it('records route templates and support IDs without request or exception content', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    onRequestError(
      new Error('synthetic-private'),
      {
        path: '/private?token=synthetic-private',
        method: 'GET',
        headers: { 'x-request-id': 'render-test', authorization: 'synthetic-private' },
      },
      {
        routerKind: 'App Router',
        routePath: '/products/[slug]',
        routeType: 'render',
        revalidateReason: undefined,
      },
    );
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      service: 'iranyaragh-storefront',
      requestId: 'render-test',
      route: '/products/[slug]',
      event: 'render.request.failed',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-private');
  });
  it('rejects unexpected route/ID input and tolerates a failing diagnostic sink', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const context = {
      routerKind: 'App Router' as const,
      routePath: '/customer@example.com',
      routeType: 'render' as const,
      revalidateReason: undefined,
    };
    const request = { path: '/private', method: 'GET', headers: { 'x-request-id': ['invalid'] } };
    onRequestError(null, request, context);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({ route: 'unknown' });
    log.mockImplementation(() => {
      throw new Error('sink unavailable');
    });
    expect(() => onRequestError(null, request, context)).not.toThrow();
  });
});
