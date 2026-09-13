const API_PREFIX = '/api/v1';

export function getApiBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!configuredBaseUrl) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be set to the API origin.');
  }
  let origin: string;
  try {
    origin = new URL(configuredBaseUrl).origin;
  } catch {
    throw new Error('NEXT_PUBLIC_API_BASE_URL must be an absolute URL.');
  }
  return origin;
}

export type ApiErrorEnvelope = {
  code: string;
  message: string;
  requestId: string;
  statusCode: number;
  details?: unknown;
};

export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly requestId: string;
  readonly statusCode: number;

  constructor(failure: ApiErrorEnvelope) {
    super(failure.message);
    this.name = 'ApiClientError';
    this.code = failure.code;
    this.requestId = failure.requestId;
    this.statusCode = failure.statusCode;
  }
}

export class ApiNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiNetworkError';
  }
}

/** The request was cancelled by the caller (e.g. stale-response protection). */
export class ApiAbortError extends Error {
  constructor(message = 'درخواست لغو شد.') {
    super(message);
    this.name = 'ApiAbortError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  headers?: Record<string, string>;
  /** Abort controller signal for stale-response protection (list views). */
  signal?: AbortSignal;
};

function resolveUrl(path: string): string {
  return `${getApiBaseUrl()}${API_PREFIX}${path}`;
}

/**
 * Script-readable double-submit CSRF cookie names the API issues
 * (AUTH_CONTRACT §12): the staff `__Host-` prefixed cookie in
 * production/staging and the explicitly suffixed development cookie for the
 * dev staff sign-in. The value is server-issued to the script context by
 * design; cookie-authenticated calls (refresh, logout) must echo it back as the
 * `X-CSRF-Token` header or the API rejects them (server session stays alive).
 */
const CSRF_COOKIE_NAMES = ['__Host-iranyaragh_csrf', 'iranyaragh_dev_csrf'] as const;

export function readCsrfToken(document: Document): string | null {
  if (!document) return null;
  const pairs = document.cookie.split(';');
  for (let i = pairs.length - 1; i >= 0; i -= 1) {
    const separatorIndex = pairs[i].indexOf('=');
    if (separatorIndex < 0) continue;
    const name = pairs[i].slice(0, separatorIndex).trim();
    if (!CSRF_COOKIE_NAMES.includes(name as (typeof CSRF_COOKIE_NAMES)[number])) continue;
    const value = pairs[i].slice(separatorIndex + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const method = options.method ?? 'GET';
  if (method !== 'GET' && !headers['X-CSRF-Token']) {
    const csrfToken = readCsrfToken(globalThis.document);
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
      throw new ApiAbortError();
    }
    throw new ApiNetworkError('امکان برقراری ارتباط با سامانه وجود ندارد.');
  }

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const failure = (payload as ApiErrorEnvelope | undefined) ?? {
      code: 'INTERNAL_ERROR',
      message: 'خطای غیرمنتظره سامانه.',
      requestId: '',
      statusCode: response.status,
    };
    throw new ApiClientError(failure);
  }

  return payload as ApiSuccess<T>;
}
