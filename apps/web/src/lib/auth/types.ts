/**
 * Contract-aligned Auth types for the storefront (CUSTOMER_WEB) client.
 *
 * These mirror the normative public contract in `docs/AUTH_CONTRACT.md` and the
 * shared `packages/contracts` auth types. They are kept local (not imported from
 * `@iranyaragh/contracts`) because the shared package has not yet landed those
 * types on `main`; once it does, the web app should re-export from the shared
 * package instead of redefining them here. See #50 / G1-09.
 *
 * The runtime HTTP shapes follow the accepted flat envelope:
 *   success -> { data: T, meta? }
 *   failure -> { code, message, requestId, statusCode, details? }
 */

export type AuthClient = 'CUSTOMER_WEB';

export type AuthenticationLevel = 'CUSTOMER_OTP' | 'STAFF_MFA';

export type AuthPrincipal = {
  userId: string;
  sessionId: string;
  authenticationLevel: AuthenticationLevel;
  permissions: string[];
  authenticatedAt: string;
  accessExpiresAt: string;
};

export type AccessTokenData = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresInSeconds: 600;
  principal: AuthPrincipal;
};

export type CustomerOtpRequestPayload = {
  mobile: string;
  client: 'CUSTOMER_WEB';
};

export type CustomerOtpChallenge = {
  challengeId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

export type CustomerOtpVerifyPayload = {
  challengeId: string;
  code: string;
  deviceName?: string;
};

export type CurrentPrincipalPayload = {
  principal: AuthPrincipal;
};

export type SessionSummary = {
  sessionId: string;
  current: boolean;
  deviceName: string | null;
  authenticationLevel: AuthenticationLevel;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
};

/** Stable flat success envelope used by all auth endpoints. */
export type ApiSuccess<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

/** Stable flat failure envelope; `code` is the machine-readable contract code. */
export type ApiFailure = {
  code: AuthApiErrorCode;
  message: string;
  requestId: string;
  statusCode: number;
  details?: unknown;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export const AUTH_API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
  'METHOD_NOT_ALLOWED',
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

export type AuthApiErrorCode = (typeof AUTH_API_ERROR_CODES)[number];

/**
 * Framework/network-level failures that do not come from the API envelope are
 * normalized to these codes so the UI can react uniformly.
 */
export type ClientErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'NON_HTTP_RESPONSE';

/** OTP code inputs are exactly six ASCII digits. */
export const OTP_CODE_PATTERN = /^[0-9]{6}$/;

/** Canonical E.164 mobile input as sent to the API. */
export const MOBILE_PATTERN = /^\+98[0-9]{10}$/;
