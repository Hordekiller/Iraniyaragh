import type { ApiErrorCode } from '@iranyaragh/contracts';

export type AppErrorCode = ApiErrorCode;

export type ErrorEnvelope = {
  code: AppErrorCode;
  message: string;
  requestId: string;
  statusCode: number;
  details?: unknown;
};

const CODE_BY_STATUS: Record<number, AppErrorCode> = {
  400: 'INVALID_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  406: 'NOT_ACCEPTABLE',
  408: 'REQUEST_TIMEOUT',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
  503: 'UPSTREAM_UNAVAILABLE',
};

export function codeForStatus(statusCode: number): AppErrorCode {
  return CODE_BY_STATUS[statusCode] ?? 'INTERNAL_ERROR';
}

export function buildErrorEnvelope({
  code,
  message,
  requestId,
  statusCode,
  details,
}: {
  code: AppErrorCode;
  message: string;
  requestId: string;
  statusCode: number;
  details?: unknown;
}): ErrorEnvelope {
  return {
    code,
    message,
    requestId,
    statusCode,
    ...(details !== undefined ? { details } : {}),
  };
}
