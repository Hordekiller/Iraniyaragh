import { describe, expect, it } from 'vitest';
import {
  AuthApiError,
  authApiErrorFromEnvelope,
  authApiErrorFromResponse,
  clientErrorCodeFromCause,
} from './errors';
import type { ApiFailure } from './types';

describe('AuthApiError', () => {
  it('carries the contract envelope fields', () => {
    const error = new AuthApiError({
      code: 'AUTH_SESSION_REPLAYED',
      message: 'reauthentication required',
      statusCode: 401,
      requestId: 'req-1',
      details: { family: 'f' },
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('AUTH_SESSION_REPLAYED');
    expect(error.statusCode).toBe(401);
    expect(error.requestId).toBe('req-1');
    expect(error.details).toEqual({ family: 'f' });
  });

  it('defaults transport-level fields', () => {
    const error = new AuthApiError({ code: 'NETWORK_ERROR', message: 'offline' });
    expect(error.statusCode).toBeUndefined();
    expect(error.requestId).toBeUndefined();
  });
});

describe('clientErrorCodeFromCause', () => {
  it('classifies an AbortError as TIMEOUT', () => {
    const abort = new DOMException('aborted', 'AbortError');
    expect(clientErrorCodeFromCause(abort)).toBe('TIMEOUT');
  });

  it('honors an explicit time-out flag', () => {
    expect(clientErrorCodeFromCause(new Error('x'), true)).toBe('TIMEOUT');
  });

  it('falls back to NETWORK_ERROR', () => {
    expect(clientErrorCodeFromCause(new TypeError('failed to fetch'))).toBe(
      'NETWORK_ERROR',
    );
    expect(clientErrorCodeFromCause(undefined)).toBe('NETWORK_ERROR');
  });
});

describe('authApiErrorFromEnvelope', () => {
  it('maps a flat envelope to an AuthApiError verbatim', () => {
    const envelope: ApiFailure = {
      code: 'RATE_LIMITED',
      message: 'try later',
      requestId: 'req-9',
      statusCode: 429,
    };
    const error = authApiErrorFromEnvelope(envelope);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.statusCode).toBe(429);
    expect(error.requestId).toBe('req-9');
  });
});

describe('authApiErrorFromResponse', () => {
  function fakeResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  it('parses a flat envelope from a JSON body', async () => {
    const error = await authApiErrorFromResponse(
      fakeResponse(401, {
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'generic',
        requestId: 'req-x',
        statusCode: 401,
      }),
    );
    expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(error.requestId).toBe('req-x');
    expect(error.statusCode).toBe(401);
  });

  it('falls back to a generic error for a non-envelope body', async () => {
    const response = new Response('<html>gateway</html>', { status: 502 });
    const error = await authApiErrorFromResponse(response);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.statusCode).toBe(502);
  });
});
