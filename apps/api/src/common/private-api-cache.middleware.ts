import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class PrivateApiCacheMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    // Run before guards: controller @Header decorators cannot protect errors
    // thrown before the controller is invoked.
    if (request.headers.authorization || /^\/api\/v\d+\/auth(?:\/|$)/u.test(request.originalUrl)) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Pragma', 'no-cache');
    }
    next();
  }
}
