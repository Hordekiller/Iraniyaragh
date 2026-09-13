import type {
  AccessTokenData,
  AuthPrincipal,
  CurrentStaffPrincipalPayload,
  StaffMfaChallenge,
  StaffPasswordPayload,
  StaffTotpVerifyPayload,
} from './staff-types';
import { StaffAuthError, type StaffAuthApi, type StaffTokenStore } from './staff-api';
import { ApiClientError, ApiNetworkError, apiFetch } from '@/lib/api/client';
import { StaffAuthFixtureClient } from './staff-fixture';
import { isFixtureAuthEnabled } from './staff-fixture-guard';

/**
 * Real staff-auth HTTP client for the admin panel (admin login slice, #50).
 *
 * Calls the live staff-auth endpoints that landed with the #49 contract runtime
 * (docs/AUTH_CONTRACT.md, `StaffAuthController` under `/api/v1/auth`):
 *
 *   POST /auth/staff/password    -> StaffMfaChallenge (pre-session; no cookies)
 *   POST /auth/staff/totp/verify -> AccessTokenData; the server sets the HttpOnly
 *                                   refresh and the script-readable CSRF cookies
 *   GET  /auth/me                -> current principal (Bearer access token)
 *   POST /auth/logout            -> server revokes the refresh session (CSRF-proofed)
 *
 * The access token is held only in the injected in-memory `StaffTokenStore` and
 * never persisted (AUTH_CONTRACT §17). Failure envelopes (flat `{code, message,
 * requestId, statusCode}` shape) are normalized to `StaffAuthError` with the same
 * codes the `StaffLoginController` maps, so the login UI cannot tell a real HTTP
 * failure from the fixture's deterministic one.
 */
export class StaffAuthHttpClient implements StaffAuthApi {
  private readonly store: StaffTokenStore;

  constructor(options: { store: StaffTokenStore }) {
    this.store = options.store;
  }

  async passwordRequest(payload: StaffPasswordPayload): Promise<StaffMfaChallenge> {
    try {
      const response = await apiFetch<StaffMfaChallenge>('/auth/staff/password', {
        method: 'POST',
        body: payload,
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async totpVerify(payload: StaffTotpVerifyPayload): Promise<AccessTokenData> {
    try {
      const response = await apiFetch<AccessTokenData>('/auth/staff/totp/verify', {
        method: 'POST',
        body: payload,
      });
      this.store.set(response.data.accessToken);
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async me(): Promise<AuthPrincipal> {
    try {
      const response = await apiFetch<CurrentStaffPrincipalPayload>('/auth/me', { token: this.store.get() });
      return response.data.principal;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async logout(): Promise<void> {
    try {
      await apiFetch<Record<string, never>>('/auth/logout', {
        method: 'POST',
        token: this.store.get(),
      });
    } catch (error) {
      throw this.mapError(error);
    }
  }

  /**
   * Envelope codes a normalizer accepts as-is. Any other server code collapses
   * to a stable client-side kind so the controller's switch stays total.
   */
  private static readonly PASS_THROUGH_CODES = new Set<StaffAuthError['code']>([
    'AUTH_INVALID_CREDENTIALS',
    'AUTH_CHALLENGE_INVALID',
    'AUTH_CHALLENGE_EXPIRED',
    'AUTH_SESSION_INVALID',
    'AUTH_SESSION_REPLAYED',
    'AUTH_REAUTHENTICATION_REQUIRED',
    'AUTH_CSRF_INVALID',
    'AUTH_PASSWORD_POLICY',
    'FORBIDDEN',
    'RATE_LIMITED',
    'VALIDATION_ERROR',
  ]);

  private mapError(error: unknown): StaffAuthError {
    if (error instanceof ApiNetworkError) {
      return new StaffAuthError({
        code: 'UPSTREAM_UNAVAILABLE',
        message: error.message,
        statusCode: 503,
      });
    }
    if (error instanceof ApiClientError) {
      const code = StaffAuthHttpClient.PASS_THROUGH_CODES.has(error.code as StaffAuthError['code'])
        ? (error.code as StaffAuthError['code'])
        : error.statusCode >= 500
          ? 'UPSTREAM_UNAVAILABLE'
          : 'INTERNAL_ERROR';
      return new StaffAuthError({
        code,
        message: error.message,
        statusCode: error.statusCode,
      });
    }
    return new StaffAuthError({ code: 'INTERNAL_ERROR', message: 'Unexpected client error.', statusCode: 500 });
  }
}

export type ResolvedStaffAuth = {
  /** The staff-auth backend for this build. */
  api: StaffAuthApi;
  /** True only when the deterministic fixture was selected (dev/e2e opt-in). */
  fixture: boolean;
};

/**
 * Resolve the staff-auth backend for the admin login slice (parallel-work
 * handoff, AUTH_CONTRACT §17): the real HTTP client is the default; the
 * deterministic fixture is used only when `NEXT_PUBLIC_FIXTURE_AUTH=true` is
 * baked into the build (local dev / e2e). Mirrors the storefront `AuthProvider`.
 */
export function createStaffAuth(store: StaffTokenStore): ResolvedStaffAuth {
  if (isFixtureAuthEnabled()) {
    return { api: new StaffAuthFixtureClient(), fixture: true };
  }
  return { api: new StaffAuthHttpClient({ store }), fixture: false };
}