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
  timeoutMs?: number;
  /** Send credentialed (cookies) so refresh/CSRF cookies and CORS apply. */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
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
    timeoutMs = DEFAULT_TIMEOUT_MS,
    credentials = 'same-origin',
    headers,
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: json === undefined ? 'GET' : 'POST',
      credentials,
      signal: controller.signal,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    });
  } catch (cause) {
    clearTimeout(timer);
    const code = clientErrorCodeFromCause(
      cause,
      cause instanceof DOMException && cause.name === 'AbortError',
    );
    throw new AuthApiError({
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
    throw await authApiErrorFromResponse(response);
  }

  const body = (await response.json().catch(() => null)) as unknown;
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return body as ApiSuccess<T>;
  }

  // The API should always return { data, ... } on 2xx. If it does not, treat
  // the response as malformed rather than fabricating a success.
  throw new AuthApiError({
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
