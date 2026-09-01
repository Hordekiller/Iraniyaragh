import { jsonRequest } from './request';
import { MemorySessionStore } from './session-store';
import type {
  AccessTokenData,
  AuthPrincipal,
  CurrentPrincipalPayload,
  CustomerOtpChallenge,
  CustomerOtpRequestPayload,
  CustomerOtpVerifyPayload,
  SessionSummary,
} from './types';

/**
 * The auth API surface used by the storefront, expressed as a narrow typed
 * interface so that a real HTTP client and a contract fixture client can be
 * swapped without touching the UI (parallel-work model; see AUTH_CONTRACT §17).
 *
 * All methods throw `AuthApiError` on failure. Endpoints are under
 * `/api/v1/auth` per the contract.
 */
export interface AuthApi {
  requestOtp(payload: CustomerOtpRequestPayload): Promise<CustomerOtpChallenge>;
  verifyOtp(payload: CustomerOtpVerifyPayload): Promise<AccessTokenData>;
  refresh(): Promise<AccessTokenData>;
  me(): Promise<AuthPrincipal>;
  listSessions(): Promise<SessionSummary[]>;
  logout(): Promise<void>;
}

export type AuthHttpClientOptions = {
  baseUrl?: string;
  store: MemorySessionStore;
  /** Used for mocked/fixture implementations; ignored by the HTTP client. */
  fetch?: typeof fetch;
};

const AUTH_BASE = '/api/v1/auth';

/**
 * Real HTTP client. Access tokens are read from the in-memory store on every
 * call and sent as a Bearer header; nothing is persisted by this module. The
 * browser supplies the refresh/CSRF cookies and Origin automatically for
 * same-origin credentialed requests.
 */
export class AuthHttpClient implements AuthApi {
  private readonly baseUrl: string;
  private readonly store: MemorySessionStore;

  constructor(options: AuthHttpClientOptions) {
    this.baseUrl = options.baseUrl ?? '';
    this.store = options.store;
  }

  async requestOtp(payload: CustomerOtpRequestPayload): Promise<CustomerOtpChallenge> {
    const { data } = await jsonRequest<CustomerOtpChallenge>(
      `${AUTH_BASE}/customer/otp/request`,
      { baseUrl: this.baseUrl, json: payload },
    );
    return data;
  }

  async verifyOtp(payload: CustomerOtpVerifyPayload): Promise<AccessTokenData> {
    const { data } = await jsonRequest<AccessTokenData>(
      `${AUTH_BASE}/customer/otp/verify`,
      { baseUrl: this.baseUrl, json: payload },
    );
    this.store.setAuthenticated(data);
    return data;
  }

  async refresh(): Promise<AccessTokenData> {
    const { data } = await jsonRequest<AccessTokenData>(`${AUTH_BASE}/refresh`, {
      baseUrl: this.baseUrl,
    });
    this.store.setAuthenticated(data);
    return data;
  }

  async me(): Promise<AuthPrincipal> {
    const token = this.requireToken();
    const { data } = await jsonRequest<CurrentPrincipalPayload>(
      `${AUTH_BASE}/me`,
      { baseUrl: this.baseUrl, accessToken: token },
    );
    return data.principal;
  }

  async listSessions(): Promise<SessionSummary[]> {
    const token = this.requireToken();
    const { data } = await jsonRequest<{ sessions: SessionSummary[] }>(
      `${AUTH_BASE}/sessions`,
      { baseUrl: this.baseUrl, accessToken: token },
    );
    return data.sessions;
  }

  async logout(): Promise<void> {
    await jsonRequest<Record<string, never>>(`${AUTH_BASE}/logout`, {
      baseUrl: this.baseUrl,
    });
    this.store.clear();
  }

  private requireToken(): string {
    const token = this.store.getAccessToken();
    if (!token) {
      throw new Error('Authenticated request requires an in-memory access token.');
    }
    return token;
  }
}
