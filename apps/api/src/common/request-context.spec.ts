import { describe, expect, it } from 'vitest';
import {
  getRequestContext,
  getRequestId,
  NO_REQUEST_ID,
  type RequestContext,
  runWithRequestContext,
} from './request-context';

describe('request-context (AsyncLocalStorage)', () => {
  it('returns NO_REQUEST_ID when no request context is active', () => {
    expect(getRequestId()).toBe(NO_REQUEST_ID);
    expect(getRequestContext()).toBeUndefined();
  });

  it('exposes the request id inside the async context', () => {
    let seen = '';
    let context: RequestContext | undefined;
    runWithRequestContext(
      { requestId: 'req-1', correlationId: 'corr-1', startedAt: '2026-08-31T00:00:00.000Z' },
      () => {
        seen = getRequestId();
        context = getRequestContext();
      },
    );

    expect(seen).toBe('req-1');
    expect(context).toMatchObject({ correlationId: 'corr-1' });
    expect(getRequestContext()).toBeUndefined();
  });

  it('nests contexts without leaking between branches', () => {
    runWithRequestContext(
      { requestId: 'outer', correlationId: 'outer', startedAt: 'x' },
      () => {
        expect(getRequestId()).toBe('outer');
        runWithRequestContext(
          { requestId: 'inner', correlationId: 'inner', startedAt: 'y' },
          () => {
            expect(getRequestId()).toBe('inner');
          },
        );
        expect(getRequestId()).toBe('outer');
      },
    );
  });
});
