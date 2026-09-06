import type {
  AccessTokenData,
  AuthPrincipal,
  StaffMfaChallenge,
  StaffPasswordPayload,
  StaffTotpVerifyPayload,
} from './staff-types';
import { TOTP_CODE_PATTERN } from './staff-types';
import { StaffAuthError } from './staff-api';

/**
 * Deterministic, contract-validated staff login fixture for the admin panel.
 *
 * Models the accepted staff password -> TOTP state machine (AUTH_CONTRACT §17
 * parallel-work model) so the admin login UI can be built and tested before the
 * real `/auth/staff/password` and `/auth/staff/totp/verify` endpoints land on
 * `main` (#49). It is NOT a security mechanism: no real hashing, rate limit or
 * persistence. Access/challenge state is memory-only and never leaves the page.
 *
 * Deliberately guards the two behaviors the contract treats as critical:
 * - account enumeration is prevented (unknown identifier and wrong password
 *   produce byte-identical errors);
 * - a challenge is single-use and expires (injectable clock for tests).
 */

export type StaffAuthFixtureOptions = {
  /** Permitted staff identifier (defaults to the fixture dev operator). */
  identifier?: string;
  /** Accepted fixture password. Only the fixture module knows this value. */
  password?: string;
  /** The one TOTP code that succeeds (e.g. a scanner-only demo code). */
  totpCode?: string;
  /** Sign-in attempts before lock-out (contract default: 5). */
  maxAttempts?: number;
  /** Retry-After seconds reported on lock-out; may be 0 in tests. */
  retryAfterSeconds?: number;
  /** Deterministic clock; defaults to `Date.now`. */
  now?: () => number;
};

/**
 * Challenge lifetime in milliseconds. Fixed at the contract TTL (300 s) so the
 * fixture never lies about the wire shape; expiry is exercised via the injected
 * clock instead of by shrinking the TTL. The literal-seconds form mirrors the
 * contract's `expiresInSeconds: 300` literal type exactly.
 */
const CHALLENGE_TTL_MS = 300_000;
const CHALLENGE_TTL_SECONDS = 300;

export class StaffAuthFixtureClient {
  private readonly identifier: string;
  private readonly password: string;
  private readonly totpCode: string;
  private readonly maxAttempts: number;
  private readonly retryAfterSeconds: number;
  private readonly now: () => number;

  private principal: AuthPrincipal | null = null;
  private challengeToken: string | null = null;
  private challengeIssuedAt = 0;
  private passwordFailures = 0;
  private lockedUntil: number | null = null;
  private revoked = false;

  constructor(options: StaffAuthFixtureOptions = {}) {
    this.identifier = options.identifier ?? 'ops@iranyaragh.local';
    this.password = options.password ?? 'FixtuRe-E2E-Admin!2026';
    this.totpCode = options.totpCode ?? '654321';
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryAfterSeconds = options.retryAfterSeconds ?? 30;
    this.now = options.now ?? (() => Date.now());
  }

  /** Simulate a server-side session revocation / permission denial. */
  revoke(): void {
    this.revoked = true;
    this.principal = null;
    this.challengeToken = null;
  }

  private fail(
    code: StaffAuthError['code'],
    message: string,
    statusCode = 401,
    retryAfterSeconds?: number,
  ): never {
    throw new StaffAuthError({ code, message, statusCode, retryAfterSeconds });
  }

  async passwordRequest(payload: StaffPasswordPayload): Promise<StaffMfaChallenge> {
    if (this.lockedUntil !== null && this.now() < this.lockedUntil) {
      this.fail('RATE_LIMITED', 'Too many sign-in attempts. Try again later.', 429, this.retryAfterSeconds);
    }

    const identifierOk = payload.identifier.trim() === this.identifier;
    const passwordOk = payload.password === this.password;

    // Enumeration-proof: identical failure for unknown identifier vs wrong password.
    if (!identifierOk || !passwordOk) {
      this.passwordFailures += 1;
      if (this.passwordFailures >= this.maxAttempts) {
        this.lockedUntil = this.now() + this.retryAfterSeconds * 1000;
        this.passwordFailures = 0;
        this.fail('RATE_LIMITED', 'Too many sign-in attempts. Try again later.', 429, this.retryAfterSeconds);
      }
      this.fail('AUTH_INVALID_CREDENTIALS', 'Invalid staff identifier or password.');
    }

    // A new challenge replaces and invalidates any previous one.
    this.passwordFailures = 0;
    this.challengeToken = `fixture-staff-challenge-${Math.floor(Math.random() * 1e9)}`;
    this.challengeIssuedAt = this.now();
    return {
      challengeToken: this.challengeToken,
      next: 'TOTP',
      expiresInSeconds: CHALLENGE_TTL_SECONDS,
    } satisfies StaffMfaChallenge;
  }

  async totpVerify(payload: StaffTotpVerifyPayload): Promise<AccessTokenData> {
    if (this.challengeToken === null || payload.challengeToken !== this.challengeToken) {
      this.fail('AUTH_CHALLENGE_INVALID', 'The verification code is invalid or has already been used.');
    }

    if (this.now() - this.challengeIssuedAt > CHALLENGE_TTL_MS) {
      this.fail('AUTH_CHALLENGE_EXPIRED', 'The verification code has expired. Sign in again.');
    }

    if (!TOTP_CODE_PATTERN.test(payload.code)) {
      this.fail('VALIDATION_ERROR', 'The verification code must be six digits.', 422);
    }

    if (payload.code !== this.totpCode) {
      this.fail('AUTH_CHALLENGE_INVALID', 'The verification code is invalid.');
    }

    // Single use: consuming the challenge invalidates it even on success.
    this.challengeToken = null;
    this.challengeIssuedAt = 0;

    const issuedAt = this.now();
    const principal: AuthPrincipal = {
      userId: this.identifier,
      sessionId: `fixture-staff-session-${Math.floor(Math.random() * 1e9)}`,
      authenticationLevel: 'STAFF_MFA',
      permissions: ['admin.dashboard.read'],
      authenticatedAt: new Date(issuedAt).toISOString(),
      accessExpiresAt: new Date(issuedAt + 600_000).toISOString(),
    };
    this.principal = principal;

    return {
      accessToken: `fixture-staff-at.${payload.code}.${principal.sessionId}`,
      tokenType: 'Bearer',
      expiresInSeconds: 600,
      principal,
    };
  }

  async me(): Promise<AuthPrincipal> {
    if (this.revoked) {
      this.fail('FORBIDDEN', 'Access to the operations panel is denied.');
    }
    if (!this.principal) {
      this.fail('AUTH_SESSION_INVALID', 'Your session has ended. Sign in again.');
    }
    return this.principal as AuthPrincipal;
  }

  async logout(): Promise<void> {
    this.principal = null;
    this.challengeToken = null;
  }
}