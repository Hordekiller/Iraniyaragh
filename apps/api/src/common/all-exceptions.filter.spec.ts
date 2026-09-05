import { BadRequestException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitException } from '../modules/auth/rate-limit.service';
import type { ErrorEnvelope } from './error-response';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { runWithRequestContext } from './request-context';

const requestId = 'req-filter-1';

function createFilter() {
  const replied: Array<{ status: number; body: unknown }> = [];
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = String(value);
      return this;
    },
    json(body: unknown) {
      replied.push({ status: this.statusCode, body });
      return this;
    },
  } as unknown as Response;

  return { filter: new AllExceptionsFilter(), response, replied, headers };
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps a standard HttpException in the error envelope with a request id', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      const error = new BadRequestException('bad input');
      filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      expect(replied).toHaveLength(1);
      const { status, body } = replied[0];
      expect(status).toBe(HttpStatus.BAD_REQUEST);
      expect(body).toMatchObject({
        code: 'INVALID_REQUEST',
        statusCode: 400,
        requestId: 'req-filter-1',
      });
    });
  });

  it('preserves a stable code and redacts secret-like details when the exception carries them', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      const error = new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { password: ['must be at least 8 characters'], email: 'already-taken' },
      });
      filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      const { body } = replied[0] as { body: ErrorEnvelope };
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.details).toEqual({ password: '[REDACTED]', email: 'already-taken' });
    });
  });

  it('routes health not-ready 503 through a stable HEALTH_NOT_READY code', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      const error = new ServiceUnavailableException({
        code: 'HEALTH_NOT_READY',
        message: 'Required dependency is unavailable',
        details: { status: 'not_ready' },
      });
      filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      const { status, body } = replied[0] as { status: number; body: ErrorEnvelope };
      expect(status).toBe(503);
      expect(body.code).toBe('HEALTH_NOT_READY');
      expect(body.details).toEqual({ status: 'not_ready' });
    });
  });

  it('maps Prisma duplicate-key errors to a 409 CONFLICT envelope', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      const prismaError = { name: 'PrismaClientKnownRequestError', code: 'P2002' };
      filter.catch(prismaError, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      const { status, body } = replied[0] as { status: number; body: ErrorEnvelope };
      expect(status).toBe(409);
      expect(body.code).toBe('CONFLICT');
    });
  });

  it('redacts secret-like details before replying', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      const error = new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'boom',
        details: { token: 'secret-token-value-abcdefghijklmnop' },
      });
      filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      const body = replied[0].body as { details: Record<string, unknown> };
      expect(body.details.token).toBe('[REDACTED]');
    });
  });

  it('masks unknown errors as a generic 500 envelope', () => {
    createContext(() => {
      const { filter, response, replied } = createFilter();
      filter.catch(new Error('database password=topsecret connection refused'), {
        switchToHttp: () => ({ getResponse: () => response }),
      } as unknown as ArgumentsHost);
      const { status, body } = replied[0] as { status: number; body: ErrorEnvelope };
      expect(status).toBe(500);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('topsecret');
    });
  });

  it('emits a bounded Retry-After header on 429 rate-limit responses', () => {
    createContext(() => {
      const { filter, response, headers } = createFilter();
      const error = new RateLimitException(45.7);
      filter.catch(error, { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost);
      expect(headers['retry-after']).toBe('45');
    });
  });

  function createContext(runBody: () => void): void {
    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: 'x' },
      () => runBody(),
    );
  }
});
