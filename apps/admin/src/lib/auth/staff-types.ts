import type {
  AccessTokenData,
  AuthPrincipal,
  CurrentPrincipalResponse,
  EmptyResponse,
  StaffMfaChallenge,
  StaffMfaChallengeResponse,
  StaffPasswordRequest,
  StaffTotpVerifyRequest,
} from '@iranyaragh/contracts';

/**
 * Contract-aligned staff Auth types for the admin panel (ADMIN_WEB client).
 *
 * The canonical shapes live in the shared `@iranyaragh/contracts` package and
 * are the single source of truth (docs/FOUNDATION.md §6). This module re-exports
 * the staff-auth slice under the admin's local names so call sites keep the
 * `Payload`/`Response` naming used by the client and controller, and adds only
 * client-only helpers (TOTP input pattern) that have no server-side meaning.
 *
 * Runtime HTTP shapes follow the accepted flat envelope (docs/AUTH_CONTRACT.md):
 *   success -> { data: T, meta? }
 *   failure -> { code, message, requestId, statusCode, details? }
 */

export type { AccessTokenData, AuthPrincipal };

/** POST /auth/staff/password request payload. */
export type StaffPasswordPayload = StaffPasswordRequest;

/** POST /auth/staff/password successful envelope body (challenge). */
export type StaffMfaChallengePayload = StaffMfaChallengeResponse['data'];

/** POST /auth/staff/totp/verify request payload. */
export type StaffTotpVerifyPayload = StaffTotpVerifyRequest;

/** The `/auth/me` response, before unwrapping `data.principal`. */
export type CurrentStaffPrincipalPayload = CurrentPrincipalResponse['data'];

/** POST /auth/logout response. */
export type StaffLogoutPayload = EmptyResponse['data'];

/** TOTP code inputs are exactly six ASCII digits. */
export const TOTP_CODE_PATTERN = /^[0-9]{6}$/;

export type { StaffMfaChallenge };