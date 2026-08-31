import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  RequestIdMiddleware,
  REQUEST_ID_HEADER,
} from './request-id.middleware';
import { getRequestId } from './request-context';

function createHarness(initialHeaders: Record<string, string> = {}) {
  const headers: Record<string, string> = {};
  const rawHeaders: Record<string, string> = { ...initialHeaders };
  const setHeader = vi.fn((name: string, value: string | number | string[]) => {
    headers[name.toLowerCase()] = String(value);
  });
  const req = { headers: rawHeaders } as unknown as Request;
  const res = { setHeader } as unknown as Response;
  const next = vi.fn<() => void>();

  return { req, res, next, headers };
}

function setRequestId(res: Response): string | undefined {
  return (res.setHeader as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string | undefined;
}

describe('RequestIdMiddleware', () => {
  it('generates a request id when none is provided', () => {
    const { req, res, next, headers } = createHarness();
    new RequestIdMiddleware().use(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, expect.any(String));
    expect(setRequestId(res)).toBeTruthy();
    expect(headers['x-request-id']).toBeTruthy();
    expect(next).toHaveBeenCalledOnce();
  });

  it('honours an inbound x-request-id header', () => {
    const { req, res, next, headers } = createHarness({ 'x-request-id': 'client-123' });
    new RequestIdMiddleware().use(req, res, next);

    expect(headers['x-request-id']).toBe('client-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('falls back to x-correlation-id when x-request-id is absent', () => {
    const { req, res, next, headers } = createHarness({ 'x-correlation-id': 'corr-9' });
    new RequestIdMiddleware().use(req, res, next);

    expect(headers['x-request-id']).toBe('corr-9');
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects malformed request ids and generates a fresh one', () => {
    const { req, res, next, headers } = createHarness({ 'x-request-id': 'bad id !!!' });
    new RequestIdMiddleware().use(req, res, next);

    expect(headers['x-request-id']).not.toBe('bad id !!!');
    expect(headers['x-request-id']).toBeTruthy();
    expect(next).toHaveBeenCalledOnce();
  });

  it('makes the request id available inside the async context', () => {
    const { req, res, next } = createHarness({ 'x-request-id': 'ctx-42' });
    let observed = '';
    next.mockImplementation(() => {
      observed = getRequestId();
    });

    new RequestIdMiddleware().use(req, res, next);

    expect(observed).toBe('ctx-42');
  });

  it('normalises whitespace on an inbound request id', () => {
    const { req, res, next, headers } = createHarness({ 'x-request-id': '  client-7 ' });
    new RequestIdMiddleware().use(req, res, next);

    expect(headers['x-request-id']).toBe('client-7');
    expect(next).toHaveBeenCalledOnce();
  });
});
