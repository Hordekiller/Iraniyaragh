import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { AppError } from './app-error';

const FOUNDATION_DEFAULT_MESSAGES: Record<string, string> = {
  INSUFFICIENT_STOCK: 'موجودی کافی نیست',
  RESERVATION_EXPIRED: 'رزرو منقضی شده است',
  ORDER_STATE_CONFLICT: 'تغییر وضعیت سفارش مجاز نیست',
  PAYMENT_ALREADY_VERIFIED: 'پرداخت قبلاً تایید شده است',
  IDEMPOTENCY_CONFLICT: 'درخواست تکراری با محتوای متفاوت رد شد',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<ExpressResponse>();
    const request = ctx.getRequest<ExpressRequest>();

    const requestId =
      (request.headers['x-request-id'] as string) ??
      (request as ExpressRequest & { requestId?: string }).requestId ??
      null;

    let code = 'INTERNAL_ERROR';
    let message = 'خطای داخلی سرور';
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof AppError) {
      code = exception.code;
      message = FOUNDATION_DEFAULT_MESSAGES[exception.code] ?? exception.message;
      status = exception.status;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      const httpResponse = exception.getResponse();
      if (typeof httpResponse === 'object' && httpResponse !== null) {
        const body = httpResponse as Record<string, unknown>;
        if (Array.isArray(body.message)) {
          code = 'VALIDATION_ERROR';
          message = Array.isArray(body.message) ? (body.message as string[]).join(', ') : body.message;
          status = exception.getStatus();
          details = { fields: body.message };
        } else {
          code = (body.error as string) ?? 'HTTP_ERROR';
          message = (body.message as string) ?? exception.message;
          status = exception.getStatus();
        }
      } else {
        message = String(httpResponse ?? exception.message);
        status = exception.getStatus();
      }
    } else if (exception instanceof Error) {
      message = exception.message || message;
    }

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${code} ${message}${requestId ? ` (requestId=${requestId})` : ''}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      success: false,
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
