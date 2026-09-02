import type { ApiSuccess } from './api';

export type AuthClient = 'CUSTOMER_WEB' | 'ADMIN_WEB';
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

export type AccessTokenResponse = ApiSuccess<AccessTokenData>;

export type CustomerOtpRequest = {
  mobile: string;
  client: 'CUSTOMER_WEB';
};

export type CustomerOtpChallenge = {
  challengeId: string;
  expiresInSeconds: 300;
  resendAfterSeconds: 60;
};

export type CustomerOtpChallengeResponse = ApiSuccess<CustomerOtpChallenge>;

export type CustomerOtpVerifyRequest = {
  challengeId: string;
  code: string;
  deviceName?: string;
};

export type StaffPasswordRequest = {
  identifier: string;
  password: string;
  deviceName?: string;
};

export type StaffMfaChallenge = {
  challengeToken: string;
  next: 'TOTP';
  expiresInSeconds: 300;
};

export type StaffMfaChallengeResponse = ApiSuccess<StaffMfaChallenge>;

export type StaffTotpVerifyRequest = {
  challengeToken: string;
  code: string;
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

export type SessionListResponse = ApiSuccess<{ sessions: SessionSummary[] }>;

export type CurrentPrincipalResponse = ApiSuccess<{ principal: AuthPrincipal }>;

export type EmptyResponse = ApiSuccess<Record<string, never>>;
