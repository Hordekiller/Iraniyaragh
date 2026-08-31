import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeRequestId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming =
      normalizeRequestId(req.headers[REQUEST_ID_HEADER]) ??
      normalizeRequestId(req.headers[CORRELATION_ID_HEADER]);
    const requestId = incoming ?? randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);

    runWithRequestContext(
      { requestId, correlationId: requestId, startedAt: new Date().toISOString() },
      () => next(),
    );
  }
}
