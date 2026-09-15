import type {
  AccessTokenData,
  AuthPrincipal,
  StaffMfaChallenge,
  StaffPasswordPayload,
  StaffTotpVerifyPayload,
} from './staff-types';

/** Error codes the admin contract may surface during staff login. */
export type StaffAuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_CHALLENGE_INVALID'
  | 'AUTH_CHALLENGE_EXPIRED'
  | 'AUTH_SESSION_INVALID'
  | 'AUTH_SESSION_REPLAYED'
  | 'AUTH_REAUTHENTICATION_REQUIRED'
  | 'AUTH_CSRF_INVALID'
  | 'AUTH_PASSWORD_POLICY'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * Normalized staff login failure. Every error the admin UI cares about is
 * mapped to this shape so the controller can react to `code` uniformly whether
 * the failure came from the real HTTP client or a deterministic fixture.
 */
export class StaffAuthError extends Error {
  readonly code: StaffAuthErrorCode;
  readonly statusCode: number;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    code: StaffAuthErrorCode;
    message: string;
    statusCode?: number;
    retryAfterSeconds?: number;
  }) {
    super(input.message);
    this.name = 'StaffAuthError';
    this.code = input.code;
    this.statusCode = input.statusCode ?? 401;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

/**
 * The typed staff-auth surface used by the admin login slice.
 *
 * `StaffAuthHttpClient` (staff-http.ts) implements this interface against the
 * live `/auth/staff/*` endpoints; `StaffAuthFixtureClient` is the deterministic
 * dev/e2e stand-in used only under the `NEXT_PUBLIC_FIXTURE_AUTH=true` opt-in
 * (parallel-work model, AUTH_CONTRACT §17). Narrow by design: session
 * management/logout-all and refresh/cross-tab behavior are separate slices.
 */
export interface StaffAuthApi {
  passwordRequest(payload: StaffPasswordPayload): Promise<StaffMfaChallenge>;
  totpVerify(payload: StaffTotpVerifyPayload): Promise<AccessTokenData>;
  me(): Promise<AuthPrincipal>;
  logout(): Promise<void>;
}

/** In-memory access-token storage injected into the controller. */
export interface StaffTokenStore {
  get(): string | null;
  set(token: string | null): void;
}