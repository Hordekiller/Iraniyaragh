/**
 * Contract-aligned Auth types for the storefront (CUSTOMER_WEB) client.
 *
 * The canonical shape lives in the shared `@iranyaragh/contracts` package and
 * is the single source of truth (docs/FOUNDATION.md §6). This module re-exports
 * those types under the storefront's alias names and keeps the handful of
 * client-only helpers (validation patterns and network-level error codes) that
 * have no server-side meaning.
 *
 * Runtime HTTP shapes follow the accepted flat envelope (see
 * docs/AUTH_CONTRACT.md):
 *   success -> { data: T, meta? }
 *   failure -> { code, message, requestId, statusCode, details? }
 */

import type {
  AccessTokenData,
  AuthPrincipal,
  ApiSuccess,
  ApiFailure,
  ApiResponse,
  CustomerOtpChallenge,
  CustomerOtpRequest,
  CustomerOtpVerifyRequest,
  CurrentPrincipalResponse,
  SessionSummary,
  AuthenticationLevel,
} from "@iranyaragh/contracts";
import { API_ERROR_CODES } from "@iranyaragh/contracts";

/** Storefront clients authenticate as `CUSTOMER_WEB` only. */
export type AuthClient = "CUSTOMER_WEB";

export type {
  AccessTokenData,
  AuthPrincipal,
  ApiSuccess,
  ApiFailure,
  ApiResponse,
  CustomerOtpChallenge,
  SessionSummary,
  AuthenticationLevel,
};

/** Alias so storefront call sites keep the `Payload` naming used by the UI. */
export type CustomerOtpRequestPayload = CustomerOtpRequest;
export type CustomerOtpVerifyPayload = CustomerOtpVerifyRequest;

/** The `/me` response envelope, before unwrapping `data.principal`. */
export type CurrentPrincipalPayload = CurrentPrincipalResponse["data"];

/** Machine-readable error code set shared by all auth endpoints. */
export const AUTH_API_ERROR_CODES = API_ERROR_CODES;
export type AuthApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Framework/network-level failures that do not come from the API envelope are
 * normalized to these codes so the UI can react uniformly.
 */
export type ClientErrorCode =
  "NETWORK_ERROR" | "TIMEOUT" | "PARSE_ERROR" | "NON_HTTP_RESPONSE";

/** OTP code inputs are exactly six ASCII digits. */
export const OTP_CODE_PATTERN = /^[0-9]{6}$/;

/** Canonical E.164 mobile input as sent to the API. */
export const MOBILE_PATTERN = /^\+98[0-9]{10}$/;
