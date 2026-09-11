import type { SessionSummary } from '@iranyaragh/contracts';

/**
 * Client port consumed by the admin session/devices management UI (#50).
 *
 * The canonical shapes live in `@iranyaragh/contracts` /auth (SessionSummary,
 * SessionListResponse, EmptyResponse) and mirror the API surface owned by
 * `SessionManagementController`:
 *
 *   GET    /auth/sessions
 *   DELETE /auth/sessions/:sessionId
 *   POST   /auth/logout-all
 *
 * Two implementations exist:
 * - `SessionManagementApiClient` (HTTP)   — live backend, the default.
 * - `SessionManagementFixture` (in-memory) — deterministic dev/e2e stand-in gated
 *   behind `NEXT_PUBLIC_SESSION_FIXTURE=true` (see `session-guard.ts`).
 *
 * UI components depend only on this port; the page model reacts to the typed
 * error kinds below and re-authentication surfaces never escape raw transport
 * errors.
 */
export interface SessionManagementPort {
  /** List every session of the current principal; the current one is flagged. */
  listSessions(): Promise<SessionSummary[]>;
  /** Revoke one session by id. Revoking the current session ends the operator's access. */
  revokeSession(sessionId: string): Promise<void>;
  /** Revoke every session of the current principal, including this one. */
  logoutAll(): Promise<void>;
}

export type SessionErrorKind =
  | 'network'
  | 'session_invalid'
  | 'reauthentication'
  | 'forbidden'
  | 'not_found'
  | 'unknown';

/** Typed, UI-consumable error preserving the API envelope's stable bits. */
export class SessionManagementError extends Error {
  readonly kind: SessionErrorKind;
  readonly code: string;
  readonly requestId: string | null;

  constructor(kind: SessionErrorKind, message: string, code: string, requestId: string | null = null) {
    super(message);
    this.name = 'SessionManagementError';
    this.kind = kind;
    this.code = code;
    this.requestId = requestId;
  }
}

/** The storefront/admin cannot reach the API. */
export class SessionNetworkError extends SessionManagementError {
  constructor(message = 'امکان برقراری ارتباط با سامانه وجود ندارد.') {
    super('network', message, 'NETWORK');
    this.name = 'SessionNetworkError';
  }
}

/** The staff session is no longer valid; a fresh sign-in is required. */
export class SessionExpiredError extends SessionManagementError {
  constructor(message = 'نشست شما منقضی شده است؛ لازم است دوباره وارد شوید.') {
    super('session_invalid', message, 'AUTH_SESSION_INVALID');
    this.name = 'SessionExpiredError';
  }
}

/** The mutation requires fresh staff authentication (STAFF_MFA within window). */
export class SessionReauthenticationRequiredError extends SessionManagementError {
  constructor(message = 'برای انجام این عملیات لازم است دوباره با MFA وارد شوید.') {
    super('reauthentication', message, 'AUTH_REAUTHENTICATION_REQUIRED');
    this.name = 'SessionReauthenticationRequiredError';
  }
}

/** Access to the panel is revoked. */
export class SessionForbiddenError extends SessionManagementError {
  constructor(message = 'دسترسی به پنل عملیات مجاز نیست.') {
    super('forbidden', message, 'FORBIDDEN');
    this.name = 'SessionForbiddenError';
  }
}

/** The target session no longer exists (already revoked). */
export class SessionNotFoundError extends SessionManagementError {
  constructor(message = 'این نشست دیگر فعال نیست و احتمالاً حذف شده است.') {
    super('not_found', message, 'NOT_FOUND');
    this.name = 'SessionNotFoundError';
  }
}

export class SessionUpstreamError extends SessionManagementError {
  constructor(message: string, code: string, requestId: string | null) {
    super('unknown', message, code, requestId);
    this.name = 'SessionUpstreamError';
  }
}

/** Wraps any raised error into the typed family above. */
export function toSessionManagementError(error: unknown): SessionManagementError {
  if (error instanceof SessionManagementError) return error;
  return new SessionManagementError(
    'unknown',
    error instanceof Error ? error.message : 'خطای غیرمنتظره سامانه.',
    'UNKNOWN',
  );
}