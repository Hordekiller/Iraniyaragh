export const API_ERROR_CODES = [
  'INVALID_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'ORDER_STATE_CONFLICT',
  'PAYMENT_STATE_CONFLICT',
  'FULFILLMENT_STATE_CONFLICT',
  'HEALTH_NOT_READY',
  'RATE_LIMITED',
  'UNPROCESSABLE',
  'UPSTREAM_UNAVAILABLE',
  'METHOD_NOT_ALLOWED',
  'NOT_ACCEPTABLE',
  'REQUEST_TIMEOUT',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_CHALLENGE_INVALID',
  'AUTH_CHALLENGE_EXPIRED',
  'AUTH_SESSION_INVALID',
  'AUTH_SESSION_REPLAYED',
  'AUTH_REAUTHENTICATION_REQUIRED',
  'AUTH_CSRF_INVALID',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export type ApiFailure = {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  statusCode: number;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
