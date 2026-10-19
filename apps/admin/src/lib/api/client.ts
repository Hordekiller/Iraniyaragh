import { getAccessToken, getSessionRevision } from '@/lib/auth/token-store';

const API_PREFIX = '/api/v1';

export function getApiBaseUrl(): string {
  // The published Admin is mounted behind the same-origin /admin proxy.
  // Keep host-only session/CSRF cookies on the actual domain in the address bar.
  if (process.env.NEXT_PUBLIC_BASE_PATH && typeof window !== 'undefined') return window.location.origin;
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
  readonly retryAfterSeconds?: number;

  constructor(failure: ApiErrorEnvelope, headers?: Headers) {
    super(failure.code === 'AUTH_REAUTHENTICATION_REQUIRED'
      ? 'برای این عملیات حساس، تأیید تازهٔ رمز عبور و کد دومرحله‌ای لازم است.'
      : ['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'].includes(failure.code)
        ? 'نشست شما معتبر نیست یا به پایان رسیده است. دوباره وارد شوید.'
        : failure.message);
    this.name = 'ApiClientError';
    this.code = failure.code;
    this.requestId = failure.requestId;
    this.statusCode = failure.statusCode;
    const retryAfter = headers?.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds >= 0) this.retryAfterSeconds = seconds;
    }
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
  /** Auth bootstrap/logout must never recursively refresh or resurrect a session. */
  recoverSession?: boolean;
  /** Some existing API routes return the contract body directly, without { data }. */
  responseShape?: 'raw';
  /** Bounded deadline override for long-running operations such as workbook import. */
  timeoutMs?: number;

};

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_TIMEOUT_MS = 120_000;

let sessionRecovery: (() => Promise<string>) | null = null;
type RecoverySerializer = <T>(operation: () => Promise<T>) => Promise<T>;
let serializeRecovery: RecoverySerializer = operation => operation();
type RecoveryBatch = { token: Promise<string>; replays: Set<Promise<unknown>>; completed: Promise<void> };
let recoveryBatch: RecoveryBatch | null = null;
let authenticationFailure: ((error: ApiClientError, revision: number) => void) | null = null;

export function registerAuthenticationFailure(handler: (error: ApiClientError, revision: number) => void): () => void {
  authenticationFailure = handler;
  return () => { if (authenticationFailure === handler) authenticationFailure = null; };
}

const freshAuthenticationListeners = new Set<() => void>();
export function onFreshAuthentication(listener: () => void): () => void {
  freshAuthenticationListeners.add(listener);
  return () => { freshAuthenticationListeners.delete(listener); };
}

/** UI notification only: no request is resubmitted and the server still authorizes every action. */
export function notifyFreshAuthentication(): void {
  for (const listener of freshAuthenticationListeners) listener();
}

export function registerSessionRecovery(recover: () => Promise<string>, serialize: RecoverySerializer = operation => operation()): () => void {
  sessionRecovery = recover;
  serializeRecovery = serialize;
  return () => { if (sessionRecovery === recover) { sessionRecovery = null; serializeRecovery = operation => operation(); } };
}

/** Hold the cross-tab rotation lock through every coalesced protected replay. */
function getRecoveryBatch(): RecoveryBatch {
  if (recoveryBatch) return recoveryBatch;
  const recover = sessionRecovery;
  const serialize = serializeRecovery;
  let accept!: (token: string) => void;
  let reject!: (error: unknown) => void;
  const batch: RecoveryBatch = {
    token: new Promise<string>((resolve, fail) => { accept = resolve; reject = fail; }),
    replays: new Set(),
    completed: Promise.resolve(),
  };
  recoveryBatch = batch;
  const clear = () => { if (recoveryBatch === batch) recoveryBatch = null; };
  // Defer acquisition until the caller has synchronously registered its replay.
  batch.completed = Promise.resolve().then(() => serialize(async () => {
    try {
      if (!recover) throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: '', requestId: '', statusCode: 401 });
      accept(await recover());
      while (batch.replays.size > 0) await Promise.allSettled([...batch.replays]);
    } finally {
      // Stop accepting work before releasing the lock, including bootstrap
      // batches without a replay. A later caller needs its own protected lease.
      clear();
    }
  })).catch(reject).finally(clear);
  return batch;
}

/** Concurrent 401s share one cookie rotation; tokens remain memory-only. */
export function recoverApiSession(): Promise<string> {
  return getRecoveryBatch().token;
}

function replayWithRecoveredSession<T>(operation: (token: string) => Promise<T>): Promise<T> {
  const batch = getRecoveryBatch();
  const replay = batch.token.then(operation);
  batch.replays.add(replay);
  void replay.then(() => batch.replays.delete(replay), () => batch.replays.delete(replay));
  return replay;
}

export async function settleSessionRecovery(): Promise<void> {
  await recoveryBatch?.completed;
}

function resolveUrl(path: string): string {
  return `${getApiBaseUrl()}${API_PREFIX}${path}`;
}

/**
 * Script-readable double-submit CSRF cookie names the API issues
 * (AUTH_CONTRACT §4.2), one per runtime cookie spec in auth.config.ts:
 * - production/staging staff and customer: `__Host-iranyaragh_csrf`;
 * - development/test customer and staff: `iranyaragh_customer_csrf`.
 * The value is server-issued to the script context by design; cookie-authenticated
 * calls (refresh, logout) must echo it back as the `X-CSRF-Token` header or the
 * API rejects them (server session stays alive).
 */
const CSRF_COOKIE_NAMES = ['__Host-iranyaragh_csrf', 'iranyaragh_customer_csrf'] as const;

export function readCsrfToken(document: Document): string | null {
  if (!document) return null;
  const pairs = document.cookie.split(';');
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex < 0) continue;
    const name = pair.slice(0, separatorIndex).trim();
    if (!CSRF_COOKIE_NAMES.includes(name as (typeof CSRF_COOKIE_NAMES)[number])) continue;
    const value = pair.slice(separatorIndex + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export function apiFetch<T>(path: string, options: RequestOptions & { responseShape: 'raw' }): Promise<T>;
export function apiFetch<T>(path: string, options?: RequestOptions): Promise<ApiSuccess<T>>;
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T | ApiSuccess<T>> {
  const sessionRevision = getSessionRevision();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (!isFormData && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const method = options.method ?? 'GET';
  if (method !== 'GET' && !headers['X-CSRF-Token']) {
    const csrfToken = readCsrfToken(globalThis.document);
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  let response: Response;
  let payload: unknown;
  const controller = new AbortController();
  const requestedTimeoutMs = options.timeoutMs;
  const timeoutMs = Number.isFinite(requestedTimeoutMs)
    ? Math.min(Math.max(Math.floor(requestedTimeoutMs!), 1), MAX_REQUEST_TIMEOUT_MS)
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  try {
    const body: BodyInit | undefined =
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body) ?? undefined;
    response = await fetch(resolveUrl(path), {
      method,
      headers,
      body,
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    // The fetch signal also bounds body consumption. Headers alone do not
    // complete a request, and an interrupted/malformed body is not success.
    const text = await response.text();
    payload = text ? (JSON.parse(text) as unknown) : undefined;
  } catch {
    if (options.signal?.aborted) {
      throw new ApiAbortError();
    }
    if (controller.signal.aborted) throw new ApiNetworkError('زمان دریافت پاسخ به پایان رسید. دوباره تلاش کنید.');
    throw new ApiNetworkError('امکان برقراری ارتباط با سامانه وجود ندارد.');
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const failure = (payload as ApiErrorEnvelope | undefined) ?? {
      code: 'INTERNAL_ERROR',
      message: 'خطای غیرمنتظره سامانه.',
      requestId: '',
      statusCode: response.status,
    };
    if (response.status === 401 && failure.code === 'AUTH_SESSION_INVALID' && options.token && options.recoverSession !== false && sessionRecovery) {
      if (getSessionRevision() !== sessionRevision) throw new ApiAbortError();
      return replayWithRecoveredSession(freshToken => {
        if (options.signal?.aborted || getSessionRevision() !== sessionRevision) throw new ApiAbortError();
        // Another tab may have revoked even a locally newer token. Recover
        // under the shared lock and retain it through the single exact replay.
        return apiFetch<T>(path, { ...options, token: freshToken, recoverSession: false });
      });
    }
    const error = new ApiClientError(failure, response.headers);
    // Only the current app identity may be invalidated. An old request or a
    // page-scoped sign-in token must not sign out a newer/different login.
    if (response.status === 401 && options.token && options.token === getAccessToken() && getSessionRevision() === sessionRevision) {
      authenticationFailure?.(error, sessionRevision);
    }
    throw error;
  }

  if (options.responseShape === 'raw') return payload as T;
  return payload as ApiSuccess<T>;
}
