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

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
};

function resolveUrl(path: string): string {
  return `${getApiBaseUrl()}${API_PREFIX}${path}`;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(resolveUrl(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: 'include',
    });
  } catch {
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
