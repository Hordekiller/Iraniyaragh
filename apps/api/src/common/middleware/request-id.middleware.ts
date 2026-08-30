import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = Array.isArray(req.headers['x-request-id'])
      ? req.headers['x-request-id'][0]
      : req.headers['x-request-id'];
    const requestId = (incoming as string) ?? randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  }
}
