import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from './request-context';
import { observeHttpRequest } from './http-diagnostics';
import { diagnosticId } from '@iranyaragh/contracts';

export const REQUEST_ID_HEADER = 'x-request-id';
export const CORRELATION_ID_HEADER = 'x-correlation-id';

const observed = Symbol('request-diagnostics');

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const marked = req as Request & { [observed]?: boolean };
    if (marked[observed]) { next(); return; }
    marked[observed] = true;
    const incoming =
      diagnosticId(req.headers[REQUEST_ID_HEADER]) ??
      diagnosticId(req.headers[CORRELATION_ID_HEADER]);
    const requestId = incoming ?? randomUUID();
    const correlationId = diagnosticId(req.headers[CORRELATION_ID_HEADER]) ?? requestId;

    res.setHeader(REQUEST_ID_HEADER, requestId);
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    runWithRequestContext(
      { requestId, correlationId, startedAt: new Date().toISOString() },
      () => {
        // bind context now: finish/close can be emitted outside the route's async chain.
        if (typeof res.once === 'function') observeHttpRequest(req, res);
        next();
      },
    );
  }
}
