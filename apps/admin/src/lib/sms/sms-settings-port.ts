import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsClearSecretPayload,
  SmsSettingsRotateSecretPayload,
  SmsSettingsSnapshot,
  SmsSettingsTestSendPayload,
  SmsSettingsUpdatePayload,
  SmsValidation,
} from '@iranyaragh/contracts';

/**
 * Client port consumed by the SMS settings admin UI (issue #115).
 *
 * The canonical shapes live in `@iranyaragh/contracts` /notifications-sms and are
 * the single source of truth. Two implementations exist:
 * - `SmsSettingsApiClient` (HTTP) — live backend, used when no fixture opt-in.
 * - `SmsSettingsFixture`        (in-memory) — deterministic dev/e2e stand-in.
 *
 * UI components depend only on this port; no business decisions live in the UI.
 */
export interface SmsSettingsPort {
  getSnapshot(): Promise<SmsSettingsSnapshot>;
  update(payload: SmsSettingsUpdatePayload): Promise<SmsSettingsSnapshot>;
  rotateSecret(payload: SmsSettingsRotateSecretPayload): Promise<SmsSettingsSnapshot>;
  clearSecret(payload: SmsSettingsClearSecretPayload): Promise<SmsSettingsSnapshot>;
  testSend(payload: SmsSettingsTestSendPayload): Promise<SmsSendOutcome>;
  validate(): Promise<SmsValidation>;
  diagnostics(): Promise<SmsDiagnostics>;
}

export type SmsSettingsErrorKind =
  | 'conflict'
  | 'idempotency_conflict'
  | 'unsupported'
  | 'invalid_input'
  | 'reauthentication'
  | 'session_invalid'
  | 'forbidden'
  | 'network'
  | 'provider'
  | 'unknown';

/**
 * Typed, UI-consumable error that preserves the API error envelope's stable bits
 * (code/requestId) while hiding the transport details. The UI differentiates only
 * the kinds below; everything else surfaces as a generic provider/unknown error.
 */
export class SmsSettingsError extends Error {
  readonly kind: SmsSettingsErrorKind;
  readonly code: string;
  readonly requestId: string | null;

  constructor(kind: SmsSettingsErrorKind, message: string, code: string, requestId: string | null = null) {
    super(message);
    this.name = 'SmsSettingsError';
    this.kind = kind;
    this.code = code;
    this.requestId = requestId;
  }
}

/** The snapshot changed since the client read it; reload and retry the edit. */
export class SmsVersionConflictError extends SmsSettingsError {
  constructor(message = 'این نسخه از تنظیمات منقضی شده است؛ پس از بارگذاری مجدد دوباره تلاش کنید.') {
    super('conflict', message, 'CONFLICT');
    this.name = 'SmsVersionConflictError';
  }
}

/**
 * The same idempotency key was reused for a different operation or payload.
 * Unlike a version conflict this is an operator error: the key must be fresh
 * or the exact same payload retried.
 */
export class SmsIdempotencyConflictError extends SmsSettingsError {
  constructor(message = 'شناسهٔ یکتا برای عملیات متفاوتی استفاده شده است؛ با کلید جدید تلاش کنید.') {
    super('idempotency_conflict', message, 'CONFLICT');
    this.name = 'SmsIdempotencyConflictError';
  }
}

/** The configured secret/configuration backend does not support the operation. */
export class SmsUnsupportedOperationError extends SmsSettingsError {
  constructor(message: string, code = 'OPERATION_UNSUPPORTED') {
    super('unsupported', message, code);
    this.name = 'SmsUnsupportedOperationError';
  }
}

/** The server rejected the input as invalid (validator-level feedback). */
export class SmsInvalidInputError extends SmsSettingsError {
  constructor(message: string) {
    super('invalid_input', message, 'VALIDATION_ERROR');
    this.name = 'SmsInvalidInputError';
  }
}

/** The mutation requires a fresh staff authentication (STAFF_MFA within window). */
export class SmsReauthenticationRequiredError extends SmsSettingsError {
  constructor(message = 'برای انجام این عملیات لازم است دوباره با MFA وارد شوید.') {
    super('reauthentication', message, 'AUTH_REAUTHENTICATION_REQUIRED');
    this.name = 'SmsReauthenticationRequiredError';
  }
}

/** The staff session is no longer valid and a fresh sign-in is required. */
export class SmsSessionExpiredError extends SmsSettingsError {
  constructor(message = 'نشست شما منقضی شده است؛ لازم است دوباره وارد شوید.') {
    super('session_invalid', message, 'AUTH_SESSION_INVALID');
    this.name = 'SmsSessionExpiredError';
  }
}

export class SmsForbiddenError extends SmsSettingsError {
  constructor(message: string) {
    super('forbidden', message, 'FORBIDDEN');
    this.name = 'SmsForbiddenError';
  }
}

export class SmsNetworkError extends SmsSettingsError {
  constructor(message: string) {
    super('network', message, 'NETWORK');
    this.name = 'SmsNetworkError';
  }
}

export class SmsUpstreamError extends SmsSettingsError {
  constructor(message: string, code: string, requestId: string | null) {
    super('provider', message, code, requestId);
    this.name = 'SmsUpstreamError';
  }
}

/**
 * Wraps any raised error into the typed family above. Unknown failures never
 * escape as raw transport errors to the UI.
 */
export function toSmsSettingsError(error: unknown): SmsSettingsError {
  if (error instanceof SmsSettingsError) return error;
  return new SmsSettingsError('unknown', error instanceof Error ? error.message : 'خطای غیرمنتظره سامانه.', 'UNKNOWN');
}