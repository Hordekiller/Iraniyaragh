import { HttpException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { AuthRuntimeConfig } from './auth.config';
import type { AuthPrincipalContext } from './auth-principal.service';
import { type AuthSessionSummary, type AuthSessionService, type RevokeUserSessionOutcome } from './auth-session.service';
import { SessionManagementController } from './session.controller';

const currentPrincipal: AuthPrincipalContext = Object.freeze({
  userId: 'user-1',
  sessionId: 'session-current',
  tokenId: 'jti-current',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 60_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['catalog.read']),
});

function createController(
  overrides: Partial<{
    listSessions: (userId: string, currentSessionId: string) => Promise<readonly AuthSessionSummary[]>;
    revokeUserSession: (
      userId: string,
      sessionId: string,
    ) => Promise<RevokeUserSessionOutcome>;
    cookies: AuthRuntimeConfig['cookies'];
  }> = {},
): {
  controller: SessionManagementController;
  sessions: {
    listSessions: ReturnType<typeof vi.fn>;
    revokeUserSession: ReturnType<typeof vi.fn>;
  };
} {
  const now = Date.now();
  const sessions = {
    listSessions: vi.fn(
      overrides.listSessions ??
        (async () => [
          Object.freeze<AuthSessionSummary>({
            sessionId: 'session-current',
            current: true,
            deviceName: 'Operations laptop',
            authenticationLevel: 'STAFF_MFA',
            createdAt: new Date(now - 60_000),
            lastUsedAt: new Date(now - 5_000),
            expiresAt: new Date(now + 600_000),
          }),
          Object.freeze<AuthSessionSummary>({
            sessionId: 'session-other',
            current: false,
            deviceName: null,
            authenticationLevel: 'CUSTOMER_OTP',
            createdAt: new Date(now - 120_000),
            lastUsedAt: null,
            expiresAt: new Date(now + 60_000),
          }),
        ]),
    ),
    revokeUserSession: vi.fn(overrides.revokeUserSession ?? (async () => 'revoked' as const)),
  };
  const config: AuthRuntimeConfig = Object.freeze({
    accessSigningSecret: 'x',
    issuer: 'iranyaragh-test',
    audience: 'iranyaragh-browser',
    accessTokenTtlSeconds: 600,
    clockToleranceSeconds: 30,
    currentHashKey: Object.freeze({ version: 1, secret: 'secret'.repeat(8) }),
    devLoginEnabled: false,
    devCode: '',
    cookies: overrides.cookies ?? {
      refreshName: 'iranyaragh_customer_refresh',
      csrfName: 'iranyaragh_customer_csrf',
      secure: false,
      sameSite: 'strict',
      path: '/',
    },
  });
  return {
    controller: new SessionManagementController(config, sessions as unknown as AuthSessionService),
    sessions,
  };
}

function mockResponse() {
  const calls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cookie = vi.fn((name: string, value: string, options: Record<string, unknown>) => {
    calls.push({ name, value, options });
  });
  return { cookie, calls } as unknown as Response & {
    calls: Array<{ name: string; value: string; options: Record<string, unknown> }>;
  };
}

describe('SessionManagementController (own session list)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the caller\'s sessions with the current one flagged, using the live principal', async () => {
    const { controller, sessions } = createController();
    const result = (await controller.list(currentPrincipal)).data.sessions;

    expect(sessions.listSessions).toHaveBeenCalledWith('user-1', 'session-current');
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      sessionId: 'session-current',
      current: true,
      deviceName: 'Operations laptop',
      authenticationLevel: 'STAFF_MFA',
      createdAt: expect.any(String),
      lastUsedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(result[1]).toEqual({
      sessionId: 'session-other',
      current: false,
      deviceName: null,
      authenticationLevel: 'CUSTOMER_OTP',
      createdAt: expect.any(String),
      lastUsedAt: null,
      expiresAt: expect.any(String),
    });
  });

  it('projects exactly the safe session-summary fields and nothing else', async () => {
    const { controller } = createController();
    const result = await controller.list(currentPrincipal);

    expect(Object.keys(result.data.sessions[0] ?? {}).sort()).toEqual([
      'authenticationLevel',
      'createdAt',
      'current',
      'deviceName',
      'expiresAt',
      'lastUsedAt',
      'sessionId',
    ]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('refreshTokenHash');
    expect(serialized).not.toContain('ipHash');
    expect(serialized).not.toContain('userAgent');
    expect(serialized).not.toContain('userId');
    expect(serialized).not.toContain('tokenFamilyId');
  });
});

describe('SessionManagementController (revoke own session)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revokes an owned non-current session and does not touch cookies', async () => {
    const { controller, sessions } = createController();
    const response = mockResponse();

    const result = await controller.remove(currentPrincipal, 'session-other', response);

    expect(sessions.revokeUserSession).toHaveBeenCalledWith('user-1', 'session-other');
    expect(result).toEqual({ data: {} });
    expect(response.calls).toEqual([]);
  });

  it('clears the auth cookies with zero Max-Age when the current session is deleted', async () => {
    const { controller, sessions } = createController();
    const response = mockResponse();

    const result = await controller.remove(currentPrincipal, 'session-current', response);

    expect(sessions.revokeUserSession).toHaveBeenCalledWith('user-1', 'session-current');
    expect(result).toEqual({ data: {} });
    const names = response.calls.map(call => call.name);
    expect(names).toEqual([
      'iranyaragh_customer_refresh',
      'iranyaragh_customer_csrf',
      'iranyaragh_dev_refresh',
      'iranyaragh_dev_csrf',
    ]);
    expect(response.calls[0]).toMatchObject({
      name: 'iranyaragh_customer_refresh',
      value: '',
      options: { httpOnly: true, secure: false, sameSite: 'strict', path: '/', maxAge: 0 },
    });
    expect(response.calls[1]).toMatchObject({
      name: 'iranyaragh_customer_csrf',
      options: { httpOnly: false, maxAge: 0 },
    });
    expect(response.calls[2]).toMatchObject({
      name: 'iranyaragh_dev_refresh',
      value: '',
      options: { httpOnly: true, secure: false, sameSite: 'strict', path: '/', maxAge: 0 },
    });
    expect(response.calls[3]).toMatchObject({
      name: 'iranyaragh_dev_csrf',
      options: { httpOnly: false, maxAge: 0 },
    });
  });

  it('clears production __Host- cookies preserving their security attributes', async () => {
    const { controller } = createController({
      cookies: {
        refreshName: '__Host-iranyaragh_refresh',
        csrfName: '__Host-iranyaragh_csrf',
        secure: true,
        sameSite: 'strict',
        path: '/',
      },
    });
    const response = mockResponse();

    await controller.remove(currentPrincipal, 'session-current', response);

    const names = response.calls.map(call => call.name);
    expect(names).toEqual(['__Host-iranyaragh_refresh', '__Host-iranyaragh_csrf']);
    expect(response.calls[0]).toMatchObject({
      name: '__Host-iranyaragh_refresh',
      options: { httpOnly: true, secure: true, maxAge: 0 },
    });
    expect(response.calls[1]).toMatchObject({
      name: '__Host-iranyaragh_csrf',
      options: { httpOnly: false, secure: true, maxAge: 0 },
    });
  });

  it('fails closed with a stable 404 and no cookie write when the session is missing or not owned', async () => {
    const { controller, sessions } = createController({ revokeUserSession: async () => 'notFound' });
    const response = mockResponse();

    const failure = controller.remove(currentPrincipal, 'someone-elses-session', response);
    await expect(failure).rejects.toBeInstanceOf(NotFoundException);
    await expect(failure).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'NOT_FOUND' }),
      status: 404,
    });
    expect(sessions.revokeUserSession).toHaveBeenCalledWith('user-1', 'someone-elses-session');
    expect(response.calls).toEqual([]);
  });

  it('treats an already-revoked session as an idempotent success without clearing cookies', async () => {
    const { controller, sessions } = createController({ revokeUserSession: async () => 'alreadyRevoked' });
    const response = mockResponse();

    await expect(controller.remove(currentPrincipal, 'session-other', response)).resolves.toEqual({ data: {} });
    expect(sessions.revokeUserSession).toHaveBeenCalledWith('user-1', 'session-other');
    expect(response.calls).toEqual([]);
  });

  it('rejects malformed session ids with a stable 404 before any lookup', async () => {
    const { controller, sessions } = createController();
    const response = mockResponse();

    for (const bad of ['', 'x'.repeat(129)]) {
      await expect(controller.remove(currentPrincipal, bad, response)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOT_FOUND' }),
        status: 404,
      });
    }
    expect(sessions.revokeUserSession).not.toHaveBeenCalled();
    expect(response.calls).toEqual([]);
  });
});

describe('SessionManagementController (controller-level error type)', () => {
  it('uses the shared HttpException envelope for not-found failures', async () => {
    const { controller } = createController({ revokeUserSession: async () => 'notFound' });

    const failure = controller.remove(currentPrincipal, 'missing-session', mockResponse());
    await expect(failure).rejects.toBeInstanceOf(HttpException);
    await expect(failure).rejects.toHaveProperty('status', 404);
  });
});