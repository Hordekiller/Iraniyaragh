export type AppErrorCode =
  | 'INVALID_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ORDER_STATE_CONFLICT'
  | 'PAYMENT_STATE_CONFLICT'
  | 'FULFILLMENT_STATE_CONFLICT'
  | 'HEALTH_NOT_READY'
  | 'RATE_LIMITED'
  | 'UNPROCESSABLE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_ACCEPTABLE'
  | 'REQUEST_TIMEOUT'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR';

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
