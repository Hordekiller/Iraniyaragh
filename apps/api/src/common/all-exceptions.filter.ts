import { type ArgumentsHost, Catch, HttpException, HttpStatus, type OnModuleInit } from '@nestjs/common';
import { RedactedLogger } from './redacted-logger';
import type { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { getRequestId } from './request-context';
import { redact, safeErrorMessage } from './redaction';
import { diagnosticException } from '@iranyaragh/contracts';
import {
  type AppErrorCode,
  buildErrorEnvelope,
  codeForStatus,
} from './error-response';

type RawResponse = string | Record<string, unknown>;

function hasStableCode(value: unknown): value is Record<string, unknown> & { code: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string'
  );
}

function normalizeHttpError(exception: HttpException): {
  statusCode: number;
  code: AppErrorCode;
  message: string;
  details?: unknown;
} {
  const statusCode = exception.getStatus();
  const response = exception.getResponse() as RawResponse;

  if (typeof response === 'string') {
    return { statusCode, code: codeForStatus(statusCode), message: response };
  }

  if (hasStableCode(response)) {
    return {
      statusCode,
      code: response.code as AppErrorCode,
      message: typeof response.message === 'string' ? response.message : 'Request failed.',
      details: response.details,
    };
  }

  const message = Array.isArray(response.message)
    ? (response.message as unknown[]).join(', ')
    : typeof response.message === 'string'
      ? response.message
      : 'Request failed.';

  return { statusCode, code: codeForStatus(statusCode), message, details: response.details };
}

function isPrismaError(exception: unknown): exception is Prisma.PrismaClientKnownRequestError {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { name?: string }).name === 'PrismaClientKnownRequestError' &&
    (exception as { code?: string }).code === 'P2002'
  );
}

@Catch()
export class AllExceptionsFilter implements OnModuleInit {
  private logger = new RedactedLogger();

  onModuleInit(): void {
    this.logger = new RedactedLogger();
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const response: Response = host.switchToHttp().getResponse();
    const requestId = getRequestId();
    // Attached only to the response, consumed by the single completion event.
    // Raw exception bodies/messages/SQL are never diagnostic payloads.
    response.locals ??= {};
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Pragma', 'no-cache');

    // body-parser errors are plain Errors, not Nest HttpExceptions. Never log
    // their body or classify a definite transport rejection as an uncertain 500.
    if (typeof exception === 'object' && exception !== null &&
      'type' in exception && exception.type === 'entity.too.large' &&
      'status' in exception && exception.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      response.locals.diagnosticFailure = { errorCode: 'PAYLOAD_TOO_LARGE' };
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json(buildErrorEnvelope({
        code: 'PAYLOAD_TOO_LARGE', statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        message: 'The JSON request exceeds the allowed size.', requestId,
      }));
      return;
    }

    if (typeof exception === 'object' && exception !== null && 'type' in exception && exception.type === 'entity.parse.failed') {
      response.locals.diagnosticFailure = { errorCode: 'INVALID_REQUEST' };
      response.status(400).json(buildErrorEnvelope({ code: 'INVALID_REQUEST', statusCode: 400, message: 'The JSON request is malformed.', requestId }));
      return;
    }

    if (exception instanceof HttpException) {
      const { statusCode, code, message, details } = normalizeHttpError(exception);
      response.locals.diagnosticFailure = { errorCode: code, ...diagnosticException(exception) };
      if ('diagnosticValidation' in exception) response.locals.diagnosticFailure.validation = exception.diagnosticValidation;

      const retryAfterSeconds =
        statusCode === HttpStatus.TOO_MANY_REQUESTS
          ? this.rateLimitRetryAfter(exception)
          : undefined;
      if (retryAfterSeconds !== undefined) {
        response.setHeader('Retry-After', String(retryAfterSeconds));
      }

      response.status(statusCode).json(
        buildErrorEnvelope({
          code,
          message: safeErrorMessage(message),
          requestId,
          statusCode,
          details: details !== undefined ? redact(details) : undefined,
        }),
      );
      return;
    }

    if (isPrismaError(exception)) {
      response.locals.diagnosticFailure = { errorCode: 'CONFLICT', causeCode: 'P2002' };
      response.status(HttpStatus.CONFLICT).json(
        buildErrorEnvelope({
          code: 'CONFLICT',
          message: 'A record with the same unique value already exists.',
          requestId,
          statusCode: HttpStatus.CONFLICT,
        }),
      );
      return;
    }

    // An unhandled exception is invisible without this: the client only sees a
    // generic 500 envelope, so operators had no way to see that a request failed
    // or why. The message is redacted and the request id is the only identifier
    // that leaves the process.
    response.locals.diagnosticFailure = { errorCode: 'INTERNAL_ERROR', ...diagnosticException(exception) };
    this.logger.event('error', {
      event: 'http.unhandled_exception',
      outcome: 'failure',
      errorCode: 'INTERNAL_ERROR',
      data: {
        requestId,
        ...diagnosticException(exception),
      },
    });

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(
      buildErrorEnvelope({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }),
    );
  }

  private rateLimitRetryAfter(exception: HttpException): number | undefined {
    const value = (exception as { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
    return Math.max(1, Math.floor(value));
  }
}
