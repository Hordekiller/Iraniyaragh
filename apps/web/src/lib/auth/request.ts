import { createDiagnosticId, diagnosticId, logClientFailure } from '@iranyaragh/contracts';
import {
  AuthApiError,
  authApiErrorFromResponse,
  clientErrorCodeFromCause,
} from './errors';
import type { ApiFailure, ApiSuccess } from './types';

export type RequestOptions = {
  baseUrl?: string;
  accessToken?: string;
  json?: unknown;
  method?: 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
  timeoutMs?: number;
  /** Send credentialed (cookies) so refresh/CSRF cookies and CORS apply. */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  /** Explicit opt-in for successful endpoints whose contract is HTTP 204. */
  allowNoContent?: boolean;
};

export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Perform a JSON request against the API and normalize the response into the
 * accepted flat envelope. Throws `AuthApiError` for transport failures and any
 * non-2xx response.
 *
 * The access token, when supplied, is sent as a Bearer header and is never
 * stored or logged by this module (its lifecycle is owned by the session
 * store). Authorization is a memory-only concern for the browser client.
 */
export async function jsonRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiSuccess<T>> {
  const {
    baseUrl = '',
    accessToken,
    json,
    method = json === undefined ? 'GET' : 'POST',
    timeoutMs = DEFAULT_TIMEOUT_MS,
    credentials = 'same-origin',
    headers,
    allowNoContent = false,
  } = options;

  const requestHeaders: Record<string, string> = {
    ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };
  const requestId = diagnosticId(new Headers(requestHeaders).get('x-request-id')) ?? createDiagnosticId();
  for (const key of Object.keys(requestHeaders)) if (key.toLowerCase() === 'x-request-id') delete requestHeaders[key];
  requestHeaders['X-Request-ID'] = requestId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  let parsed: unknown;
  let responseRequestId = requestId;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      credentials,
      signal: controller.signal,
      headers: requestHeaders,
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
    responseRequestId = diagnosticId(response.headers?.get('x-request-id')) ?? requestId;
    parsed = await response.json().catch((error: unknown) => { if (controller.signal.aborted) throw error; return null; });
  } catch (cause) {
    clearTimeout(timer);
    const code = clientErrorCodeFromCause(
      cause,
      controller.signal.aborted,
    );
    logClientFailure('storefront', responseRequestId, code === 'TIMEOUT' ? 'timeout' : 'network');
    throw new AuthApiError({
      requestId: responseRequestId,
      code,
      message:
        code === 'TIMEOUT'
          ? `Request timed out after ${timeoutMs} ms.`
          : 'Could not reach the server. Check your connection and try again.',
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await authApiErrorFromResponse(response, parsed, responseRequestId);
    logClientFailure('storefront', error.requestId ?? requestId, 'http', response.status);
    throw error;
  }

  if (allowNoContent && response.status === 204) {
    return { data: undefined as T };
  }

  const body = parsed;
  if (
    body &&
    typeof body === 'object' &&
    'data' in (body as Record<string, unknown>)
  ) {
    return body as ApiSuccess<T>;
  }

  // The API should always return { data, ... } on 2xx. If it does not, treat
  // the response as malformed rather than fabricating a success.
  logClientFailure('storefront', responseRequestId, 'parse', response.status);
  throw new AuthApiError({
    requestId: responseRequestId,
    code: 'PARSE_ERROR',
    message: 'The server returned an unexpected response shape.',
    statusCode: response.status,
  });
}

/**
 * Convenience discriminator for consumer code that must branch on the flat
 * envelope. Guarantees type narrowing on success.
 */
export function isApiSuccess<T>(value: unknown): value is ApiSuccess<T> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'data' in (value as Record<string, unknown>),
  );
}

export function isApiFailure(value: unknown): value is ApiFailure {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as ApiFailure).code === 'string' &&
    typeof (value as ApiFailure).statusCode === 'number',
  );
}
