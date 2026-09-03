import { AuthApiError } from './errors';
import { jsonRequest } from './request';
import { MemorySessionStore } from './session-store';
import { normalizeIranianMobile } from './normalize';
import type { AuthApi } from './api';
import type {
  AccessTokenData,
  AuthPrincipal,
  CustomerOtpChallenge,
  CustomerOtpRequestPayload,
  CustomerOtpVerifyPayload,
  SessionSummary,
} from './types';

const DEFAULT_EXPIRES_IN = 300;
const DEFAULT_RESEND_AFTER = 60;
const ACCESS_TOKEN_TTL_SECONDS = 600;
/** Retry-After for the fixture's rate-limit (5 failed attempts). */
const DEFAULT_RATE_LIMIT_RETRY_AFTER_SECONDS = 5;

export type AuthFixtureOptions = {
  store?: MemorySessionStore;
  /** Simulate a transport-level outage for `otp/request` when non-empty. */
  offlineWindowMs?: number;
  /** Simulate the server 503 provider-down state on `otp/request`. */
  providerDown?: boolean;
  /** Deterministic clock for expiry simulation. */
  now?: () => number;
};

/**
 * Deterministic, contract-validated fixture implementation of `AuthApi`.
 *
 * It models the accepted customer OTP state machine so the UI and E2E suites
 * can develop against real behavior before the backend endpoints land on
 * `main` (parallel-work model, AUTH_CONTRACT §17). It is NOT a substitute for
 * the server: it performs no real rate limiting, hashing or persistence.
 */
export class AuthFixtureClient implements AuthApi {
  private readonly store: MemorySessionStore;
  private readonly options: AuthFixtureOptions;

  private challengeId: string | null = null;
  private challengeRequestedAt = 0;
  private verifyFailures = 0;

  constructor(options: AuthFixtureOptions = {}) {
    this.store = options.store ?? new MemorySessionStore();
    this.options = options;
  }

  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  async requestOtp(payload: CustomerOtpRequestPayload): Promise<CustomerOtpChallenge> {
    if (!normalizeIranianMobile(payload.mobile)) {
      throw new AuthApiError({
        code: 'VALIDATION_ERROR',
        message: 'A valid Iranian mobile number is required.',
        statusCode: 422,
        details: { mobile: payload.mobile },
      });
    }
    if (this.options.providerDown) {
      throw new AuthApiError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The verification provider is temporarily unavailable.',
        statusCode: 503,
      });
    }
    if (
      this.options.offlineWindowMs &&
      this.now() < this.options.offlineWindowMs
    ) {
      throw new AuthApiError({ code: 'NETWORK_ERROR', message: 'Network unavailable.' });
    }

    // Contract: a new request resets the challenge (resend invalidates prior).
    this.challengeId = `fixture-challenge-${Math.floor(Math.random() * 1e9)}`;
    this.challengeRequestedAt = this.now();
    this.verifyFailures = 0;

    return {
      challengeId: this.challengeId,
      expiresInSeconds: DEFAULT_EXPIRES_IN,
      resendAfterSeconds: DEFAULT_RESEND_AFTER,
    };
  }

  async verifyOtp(payload: CustomerOtpVerifyPayload): Promise<AccessTokenData> {
    if (!this.challengeId || payload.challengeId !== this.challengeId) {
      throw new AuthApiError({
        code: 'AUTH_CHALLENGE_INVALID',
        message: 'The verification code is invalid or has already been used.',
        statusCode: 401,
      });
    }

    const elapsed = (this.now() - this.challengeRequestedAt) / 1000;
    if (elapsed > DEFAULT_EXPIRES_IN) {
      throw new AuthApiError({
        code: 'AUTH_CHALLENGE_EXPIRED',
        message: 'The verification code has expired. Request a new one.',
        statusCode: 401,
      });
    }

    if (!/^[0-9]{6}$/.test(payload.code)) {
      throw new AuthApiError({
        code: 'VALIDATION_ERROR',
        message: 'The verification code must be six digits.',
        statusCode: 400,
      });
    }

    // Fixture: '000000' is the only "invalid" code, for UI retry coverage.
    if (payload.code === '000000') {
      this.verifyFailures += 1;
      if (this.verifyFailures >= 5) {
        this.challengeId = null;
        throw new AuthApiError({
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Request a new code and try again later.',
          statusCode: 429,
          retryAfterSeconds: DEFAULT_RATE_LIMIT_RETRY_AFTER_SECONDS,
        });
      }
      throw new AuthApiError({
        code: 'AUTH_CHALLENGE_INVALID',
        message: 'The verification code is invalid.',
        statusCode: 401,
      });
    }

    const principal: AuthPrincipal = {
      userId: 'fixture-user-otp-1',
      sessionId: 'fixture-session-1',
      authenticationLevel: 'CUSTOMER_OTP',
      permissions: [],
      authenticatedAt: new Date(this.now()).toISOString(),
      accessExpiresAt: new Date(this.now() + DEFAULT_EXPIRES_IN * 1000).toISOString(),
    };

    const data: AccessTokenData = {
      accessToken: `fixture-at.${payload.code}.${this.challengeId}`,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      principal,
    };
    this.challengeId = null; // single use
    this.store.setAuthenticated(data);
    return data;
  }

  async refresh(): Promise<AccessTokenData> {
    const existing = this.store.getPrincipal();
    if (!existing) {
      throw new AuthApiError({
        code: 'AUTH_SESSION_INVALID',
        message: 'Your session has ended. Please sign in again.',
        statusCode: 401,
      });
    }
    const data: AccessTokenData = {
      accessToken: `fixture-at.refreshed.${existing.sessionId}`,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      principal: {
        ...existing,
        accessExpiresAt: new Date(this.now() + DEFAULT_EXPIRES_IN * 1000).toISOString(),
      },
    };
    this.store.setAuthenticated(data);
    return data;
  }

  async me(): Promise<AuthPrincipal> {
    const principal = this.store.getPrincipal();
    if (!principal) {
      throw new AuthApiError({
        code: 'AUTH_SESSION_INVALID',
        message: 'Your session has ended. Please sign in again.',
        statusCode: 401,
      });
    }
    return principal;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const principal = this.store.getPrincipal();
    if (!principal) {
      throw new AuthApiError({
        code: 'AUTH_SESSION_INVALID',
        message: 'Your session has ended. Please sign in again.',
        statusCode: 401,
      });
    }
    const base = new Date(this.now());
    return [
      {
        sessionId: principal.sessionId,
        current: true,
        deviceName: 'Fixture device',
        authenticationLevel: principal.authenticationLevel,
        createdAt: base.toISOString(),
        lastUsedAt: base.toISOString(),
        expiresAt: new Date(base.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }

  async logout(): Promise<void> {
    this.store.clear();
  }

  /** Re-exported so consumers that need a real fetch client can share the import. */
  static readonly jsonRequest = jsonRequest;
}
