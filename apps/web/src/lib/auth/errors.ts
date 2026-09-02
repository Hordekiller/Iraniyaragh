import type {
  ApiFailure,
  AuthApiErrorCode,
  ClientErrorCode,
} from './types';

/**
 * A normalized auth failure. If it originated from the API it carries the flat
 * contract envelope (stable `code`, `requestId`, `statusCode`); otherwise it is
 * a transport-level failure (network/timeout/parse) with a client scope code.
 */
export class AuthApiError extends Error {
  readonly code: AuthApiErrorCode | ClientErrorCode;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(input: {
    code: AuthApiErrorCode | ClientErrorCode;
    message: string;
    statusCode?: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = 'AuthApiError';
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

const NETWORK_CODE_BY_CAUSE: Record<string, ClientErrorCode> = {
  AbortError: 'TIMEOUT',
};

/** Normalize an `Error`/`DOMException`/`TypeError` from `fetch` into a client code. */
export function clientErrorCodeFromCause(
  cause: unknown,
  timedOut = false,
): ClientErrorCode {
  if (timedOut) return 'TIMEOUT';
  const name =
    cause instanceof Error
      ? cause.name
      : typeof cause === 'object' &&
          cause !== null &&
          'name' in cause &&
          typeof cause.name === 'string'
        ? cause.name
        : '';
  if (NETWORK_CODE_BY_CAUSE[name]) return NETWORK_CODE_BY_CAUSE[name];
  return 'NETWORK_ERROR';
}

/** Map a flat contract error envelope to a thrown `AuthApiError`. */
export function authApiErrorFromEnvelope(envelope: ApiFailure): AuthApiError {
  return new AuthApiError({
    code: envelope.code,
    message: envelope.message,
    statusCode: envelope.statusCode,
    requestId: envelope.requestId,
    details: envelope.details,
  });
}

/**
 * A non-2xx response body may be a flat contract envelope, an opaque error, or
 * empty. This performs a best-effort parse into an `AuthApiError`, never
 * surfacing secret material in the message.
 */
export async function authApiErrorFromResponse(
  response: Response,
): Promise<AuthApiError> {
  const envelope: Partial<ApiFailure> = {};
  try {
    const body = (await response.json()) as unknown;
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (typeof obj.code === 'string') {
        envelope.code = obj.code as AuthApiErrorCode;
      }
      if (typeof obj.message === 'string') {
        envelope.message = obj.message;
      }
      if (typeof obj.requestId === 'string') {
        envelope.requestId = obj.requestId;
      }
      if (typeof obj.statusCode === 'number') {
        envelope.statusCode = obj.statusCode;
      }
      if (obj.details !== undefined) {
        envelope.details = obj.details;
      }
    }
  } catch {
    // Ignore parse failures; fall through to a generic error.
  }

  return new AuthApiError({
    code: envelope.code ?? 'INTERNAL_ERROR',
    message:
      envelope.message ??
      `Request failed with status ${response.status} (${response.statusText ?? ''}).`,
    statusCode: envelope.statusCode ?? response.status,
    requestId: envelope.requestId,
    details: envelope.details,
  });
}
