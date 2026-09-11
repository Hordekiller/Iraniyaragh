import { apiFetch, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import type { SessionListResponse, SessionSummary } from '@iranyaragh/contracts';
import {
  SessionExpiredError,
  SessionForbiddenError,
  SessionNetworkError,
  SessionNotFoundError,
  SessionReauthenticationRequiredError,
  SessionUpstreamError,
  toSessionManagementError,
  type SessionManagementPort,
} from './session-port';

/**
 * HTTP implementation of `SessionManagementPort` against the live
 * `SessionManagementController` API (#50, AUTH_CONTRACT):
 *
 *   GET    /auth/sessions
 *   DELETE /auth/sessions/:sessionId
 *   POST   /auth/logout-all
 *
 * Every endpoint requires a live staff session carried as a Bearer token; the
 * server is authoritative. The client only maps the resulting error kinds so
 * the page model can react uniformly (expiry -> re-sign-in, NOT_FOUND -> reload).
 */
export class SessionManagementApiClient implements SessionManagementPort {
  constructor(private readonly getToken: () => string | null) {}

  private async request<T>(method: string, path: string): Promise<T> {
    try {
      const response = await apiFetch<T>(path, { method, token: this.getToken() });
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): unknown {
    if (error instanceof ApiNetworkError) return new SessionNetworkError(error.message);
    if (!(error instanceof ApiClientError)) return toSessionManagementError(error);

    switch (error.code) {
      case 'AUTH_REAUTHENTICATION_REQUIRED':
        return new SessionReauthenticationRequiredError(error.message);
      case 'AUTH_SESSION_INVALID':
      case 'AUTH_SESSION_REPLAYED':
        return new SessionExpiredError(error.message);
      case 'FORBIDDEN':
        return new SessionForbiddenError(error.message);
      case 'NOT_FOUND':
        return new SessionNotFoundError(error.message);
      case 'UPSTREAM_UNAVAILABLE':
      case 'RATE_LIMITED':
      case 'INTERNAL_ERROR':
      default:
        return new SessionUpstreamError(error.message, error.code, error.requestId);
    }
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.request<SessionListResponse['data']>('GET', '/auth/sessions').then((d) => d.sessions);
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request<Record<string, never>>('DELETE', `/auth/sessions/${encodeURIComponent(sessionId)}`);
  }

  async logoutAll(): Promise<void> {
    await this.request<Record<string, never>>('POST', '/auth/logout-all');
  }
}