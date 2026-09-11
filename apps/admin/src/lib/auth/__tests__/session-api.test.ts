import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { SessionManagementApiClient } from '../session-api';
import {
  SessionExpiredError,
  SessionForbiddenError,
  SessionNetworkError,
  SessionNotFoundError,
  SessionReauthenticationRequiredError,
  SessionUpstreamError,
} from '../session-port';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [])) as never,
  };
});

function errorEnvelope(code: string, statusCode = 400, message = `msg-${code}`) {
  return { code, message, requestId: 'r1', statusCode };
}

function mockEnvelope(code: string, statusCode = 400): void {
  apiFetchMock.mockRejectedValueOnce(new ApiClientError(errorEnvelope(code, statusCode)));
}

describe('SessionManagementApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const client = new SessionManagementApiClient(() => 'at-1');

  it('lists sessions and returns the arrays payload', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: { sessions: [{ sessionId: 's1', current: true }] },
    });
    const result = await client.listSessions();
    expect(result[0].sessionId).toBe('s1');
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/sessions', expect.objectContaining({ method: 'GET' }));
  });

  it('maps AUTH_SESSION_INVALID to an actionable session-expired error', async () => {
    mockEnvelope('AUTH_SESSION_INVALID', 401);
    await expect(client.listSessions()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('maps AUTH_SESSION_REPLAYED to an actionable session-expired error', async () => {
    mockEnvelope('AUTH_SESSION_REPLAYED', 401);
    await expect(client.listSessions()).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('maps AUTH_REAUTHENTICATION_REQUIRED to a re-authentication error', async () => {
    mockEnvelope('AUTH_REAUTHENTICATION_REQUIRED', 401);
    await expect(client.listSessions()).rejects.toBeInstanceOf(SessionReauthenticationRequiredError);
  });

  it('maps FORBIDDEN to a forbidden error', async () => {
    mockEnvelope('FORBIDDEN', 403);
    await expect(client.listSessions()).rejects.toBeInstanceOf(SessionForbiddenError);
  });

  it('maps NOT_FOUND to a session-not-found error on revoke', async () => {
    mockEnvelope('NOT_FOUND', 404);
    await expect(client.revokeSession('s1')).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('maps network failure to SessionNetworkError', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiNetworkError('offline'));
    await expect(client.listSessions()).rejects.toBeInstanceOf(SessionNetworkError);
  });

  it('surfaces unknown error codes as upstream errors', async () => {
    mockEnvelope('INTERNAL_ERROR', 502);
    await expect(client.logoutAll()).rejects.toBeInstanceOf(SessionUpstreamError);
  });

  it('sends the encoded session id on revoke and resolves on success', async () => {
    apiFetchMock.mockResolvedValueOnce({});
    await expect(client.revokeSession('s/n')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/auth/sessions/s%2Fn',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('posts logout-all and resolves on success', async () => {
    apiFetchMock.mockResolvedValueOnce({});
    await expect(client.logoutAll()).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/auth/logout-all', expect.objectContaining({ method: 'POST' }));
  });
});