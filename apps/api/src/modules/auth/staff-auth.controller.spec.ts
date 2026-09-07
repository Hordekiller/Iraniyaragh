import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { StaffAuthController } from './staff-auth.controller';
import { AuthCsrfException } from './auth-http';
import type { AuthRuntimeConfig } from './auth.config';
import type { AuthHashService } from './auth-hash.service';
import type { AuthSessionService } from './auth-session.service';
import type { AuthPrincipalContext, AuthPrincipalService } from './auth-principal.service';
import type { PrismaService } from '../../database/prisma.service';
import type { StaffDevSignInDto } from './staff-auth.dto';
import type { AuthTokenService } from './auth-token.service';
import type { StaffAuthService } from './staff-auth.service';
import type { StaffMfaService } from './staff-mfa.service';

const DEV_ADMIN_EMAIL = 'dev-admin@iranyaragh.local';

const principal: AuthPrincipalContext = Object.freeze({
  userId: 'seed_dev_admin',
  sessionId: 'session-1',
  tokenId: 'jti-1',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 60_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['catalog.read', 'catalog.write']),
});

function createController(overrides: Partial<{
  hashes: Pick<AuthHashService, 'hash'>;
  sessions: Pick<AuthSessionService, 'createSession' | 'revokeByRefreshToken' | 'rotateSession'>;
  principals: Pick<AuthPrincipalService, 'resolveBearerToken'>;
  prisma: Pick<PrismaService, 'user'>;
  tokens: Pick<AuthTokenService, 'matchesCsrfToken'>;
  staffAuth: Pick<StaffAuthService, 'requestPasswordChallenge' | 'updateCredentialAndRotateSession'>;
  staffMfa: Pick<StaffMfaService, 'verifyTotp' | 'regenerateRecoveryCodes'>;
  devLoginEnabled: boolean;
  devCode: string;
}> = {}): StaffAuthController {
  const hashes = overrides.hashes ?? { hash: vi.fn((value: string) => `hash:${value}`) };
  const sessions = overrides.sessions ?? {
    createSession: vi.fn(async () => ({
      accessToken: 'at-1',
      csrfToken: 'csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'rt-1',
      sessionId: 'session-1',
      tokenFamilyId: 'tf-1',
    })),
    revokeByRefreshToken: vi.fn(async () => true),
    rotateSession: vi.fn(async () => ({
      accessToken: 'refreshed-at-1',
      csrfToken: 'refreshed-csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'refreshed-rt-1',
      sessionId: 'refreshed-session-1',
      tokenFamilyId: 'tf-1',
    })),
  };
  const principals = overrides.principals ?? {
    resolveBearerToken: vi.fn(async () => principal),
  };
  const prisma = overrides.prisma ?? {
    user: {
      findUnique: vi.fn(async () => ({ id: 'seed_dev_admin' })),
    },
  };
  const tokens = overrides.tokens ?? { matchesCsrfToken: vi.fn(() => true) };
  const staffAuth = overrides.staffAuth ?? {
    requestPasswordChallenge: vi.fn(async () => ({
      data: { challengeToken: 'challenge-1', next: 'TOTP' as const, expiresInSeconds: 300 as const },
    })),
  };
  const staffMfa = overrides.staffMfa ?? {
    verifyTotp: vi.fn(async () => ({
      response: {
        data: {
          accessToken: 'staff-mfa-at-1',
          tokenType: 'Bearer' as const,
          expiresInSeconds: 600 as const,
          principal: {
            userId: 'seed_dev_admin',
            sessionId: 'staff-mfa-session-1',
            authenticationLevel: 'STAFF_MFA' as const,
            permissions: [],
            authenticatedAt: new Date().toISOString(),
            accessExpiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
      },
      refreshToken: 'staff-mfa-refresh-1',
      csrfToken: 'staff-mfa-csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
    })),
  };
  const config: AuthRuntimeConfig = Object.freeze({
    accessSigningSecret: 'x',
    issuer: 'iranyaragh-test',
    audience: 'iranyaragh-browser',
    accessTokenTtlSeconds: 600,
    clockToleranceSeconds: 30,
    currentHashKey: Object.freeze({ version: 1, secret: 'secret'.repeat(8) }),
    devLoginEnabled: overrides.devLoginEnabled ?? true,
    devCode: overrides.devCode ?? 'dev-code',
    cookies: Object.freeze({
      refreshName: 'iranyaragh_dev_refresh',
      csrfName: 'iranyaragh_dev_csrf',
      secure: false,
      sameSite: 'strict',
      path: '/',
    }),
    corsOrigins: ['http://localhost:3001'],
  });
  return new StaffAuthController(
    config,
    hashes as AuthHashService,
    sessions as AuthSessionService,
    principals as AuthPrincipalService,
    prisma as PrismaService,
    tokens as AuthTokenService,
    staffAuth as StaffAuthService,
    staffMfa as StaffMfaService,
  );
}

function mockResponse() {
  const calls: Array<{ name: string; value: string }> = [];
  const cookie = vi.fn((name: string, value: string) => {
    calls.push({ name, value });
  });
  return { cookie, calls } as unknown as Response & { calls: Array<{ name: string; value: string }> };
}

function mockRequest() {
  return {
    ip: '127.0.0.1',
    headers: {
      cookie: 'iranyaragh_dev_refresh=refresh-token; iranyaragh_dev_csrf=csrf-token',
      origin: 'http://localhost:3001',
      'x-csrf-token': 'csrf-token',
    },
  };
}

const body = (code: string): StaffDevSignInDto => ({ code });

describe('StaffAuthController (dev sign-in)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when dev login is not enabled', async () => {
    const controller = createController({ devLoginEnabled: false });
    const response = mockResponse();
    await expect(controller.devSignIn(body('anything'), {} as never, response)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects an incorrect dev code', async () => {
    const controller = createController({ devCode: 'right-code' });
    const response = mockResponse();
    await expect(controller.devSignIn(body('wrong-code'), {} as never, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it('rejects when the seeded admin user is missing', async () => {
    const prisma = { user: { findUnique: vi.fn(async () => null) } };
    const controller = createController({ prisma });
    const response = mockResponse();
    await expect(controller.devSignIn(body('dev-code'), {} as never, response)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('issues a real session, sets dev cookies, and returns access token on success', async () => {
    const controller = createController();
    const response = mockResponse();
    const result = await controller.devSignIn(body('dev-code'), mockRequest() as never, response);

    expect(result.data.accessToken).toBe('at-1');
    expect(result.data.tokenType).toBe('Bearer');
    expect(result.data.expiresInSeconds).toBe(600);
    expect(result.data.principal.userId).toBe('seed_dev_admin');
    expect(result.data.principal.authenticationLevel).toBe('STAFF_MFA');

    const cookieNames = response.calls.map(call => call.name);
    expect(cookieNames).toEqual(['iranyaragh_dev_refresh', 'iranyaragh_dev_csrf']);
    expect(response.calls[0]?.name).toBe('iranyaragh_dev_refresh');
  });

  it('queries the seeded admin by email only when enabled', async () => {
    const prisma = { user: { findUnique: vi.fn(async () => ({ id: 'seed_dev_admin' })) } };
    const controller = createController({ prisma });
    const response = mockResponse();
    await controller.devSignIn(body('dev-code'), mockRequest() as never, response);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: DEV_ADMIN_EMAIL }, select: { id: true } });
  });

  it('returns a password-only MFA challenge without issuing a session', async () => {
    const requestPasswordChallenge = vi.fn(async () => ({
      data: { challengeToken: 'challenge-1', next: 'TOTP' as const, expiresInSeconds: 300 as const },
    }));
    const controller = createController({ staffAuth: { requestPasswordChallenge } });

    await expect(
      controller.staffPassword(
        { identifier: ' Staff@Example.com ', password: 'a secure password here' },
        { ip: '192.0.2.10' } as never,
      ),
    ).resolves.toEqual({ data: { challengeToken: 'challenge-1', next: 'TOTP', expiresInSeconds: 300 } });
    expect(requestPasswordChallenge).toHaveBeenCalledWith({
      identifier: ' Staff@Example.com ',
      password: 'a secure password here',
      ipAddress: '192.0.2.10',
    });
  });
});

describe('StaffAuthController (me / logout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the current principal for /me', async () => {
    const controller = createController();
    const result = await controller.me(principal);
    expect(result.data.principal.userId).toBe('seed_dev_admin');
    expect(result.data.principal.permissions).toContain('catalog.write');
  });

  it('sets cookies only after the TOTP service returns a completed staff session', async () => {
    const verifyTotp = vi.fn(async () => ({
      response: {
        data: {
          accessToken: 'staff-mfa-at-1',
          tokenType: 'Bearer' as const,
          expiresInSeconds: 600 as const,
          principal: {
            userId: 'seed_dev_admin',
            sessionId: 'staff-mfa-session-1',
            authenticationLevel: 'STAFF_MFA' as const,
            permissions: [],
            authenticatedAt: new Date().toISOString(),
            accessExpiresAt: new Date(Date.now() + 600_000).toISOString(),
          },
        },
      },
      refreshToken: 'staff-mfa-refresh-1',
      csrfToken: 'staff-mfa-csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
    }));
    const controller = createController({ staffMfa: { verifyTotp } });
    const response = mockResponse();

    const result = await controller.staffTotp(
      { challengeToken: 'challenge-1', code: '123456' },
      { ip: '192.0.2.10', headers: { 'user-agent': 'test-agent' } } as never,
      response,
    );

    expect(result.data.accessToken).toBe('staff-mfa-at-1');
    expect(verifyTotp).toHaveBeenCalledWith({
      challengeToken: 'challenge-1',
      code: '123456',
      ipAddress: '192.0.2.10',
      userAgent: 'test-agent',
    });
    expect(response.calls.map(call => call.name)).toEqual(['iranyaragh_dev_refresh', 'iranyaragh_dev_csrf']);
  });

  it('revokes the session and clears cookies on logout', async () => {
    const revokeByRefreshToken = vi.fn(async () => true);
    const controller = createController({
      sessions: { createSession: vi.fn(), revokeByRefreshToken, rotateSession: vi.fn() },
    });
    const response = mockResponse();
    const result = await controller.logout(mockRequest() as never, response);
    expect(revokeByRefreshToken).toHaveBeenCalledWith('refresh-token');
    expect(result).toEqual({ data: {} });
    const cleared = response.calls.filter(call => call.name.endsWith('_refresh') || call.name.endsWith('_csrf'));
    expect(cleared.length).toBe(2);
  });

  it('rotates a cookie-authenticated session only after origin and CSRF validation', async () => {
    const rotateSession = vi.fn(async () => ({
      accessToken: 'refreshed-at-1',
      csrfToken: 'refreshed-csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'refreshed-rt-1',
      sessionId: 'refreshed-session-1',
      tokenFamilyId: 'tf-1',
    }));
    const controller = createController({ sessions: { createSession: vi.fn(), revokeByRefreshToken: vi.fn(), rotateSession } });
    const response = mockResponse();

    const result = await controller.refresh(mockRequest() as never, response);

    expect(rotateSession).toHaveBeenCalledWith('refresh-token');
    expect(result.data.accessToken).toBe('refreshed-at-1');
    expect(response.calls.map(call => call.name)).toEqual(['iranyaragh_dev_refresh', 'iranyaragh_dev_csrf']);
  });

  it('rejects missing origin or CSRF proof before rotating or revoking', async () => {
    const rotateSession = vi.fn();
    const revokeByRefreshToken = vi.fn();
    const controller = createController({ sessions: { createSession: vi.fn(), revokeByRefreshToken, rotateSession } });
    const response = mockResponse();
    const request = { headers: { cookie: 'iranyaragh_dev_refresh=refresh-token' } };

    await expect(controller.refresh(request as never, response)).rejects.toBeInstanceOf(AuthCsrfException);
    await expect(controller.logout(request as never, response)).rejects.toBeInstanceOf(AuthCsrfException);
    expect(rotateSession).not.toHaveBeenCalled();
    expect(revokeByRefreshToken).not.toHaveBeenCalled();
    expect(response.calls).toEqual([]);
  });
});

describe('StaffAuthController (change password)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockResponseWithOptions() {
    const calls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    const cookie = vi.fn((name: string, value: string, options: Record<string, unknown>) => {
      calls.push({ name, value, options });
    });
    return { cookie, calls } as unknown as Response & {
      calls: Array<{ name: string; value: string; options: Record<string, unknown> }>;
    };
  }

  it('delegates to the change service, rotates cookies and returns an empty envelope', async () => {
    const updateCredentialAndRotateSession = vi.fn(async () => ({
      accessToken: 'new-at-1',
      csrfToken: 'new-csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'new-rt-1',
      sessionId: 'new-session-1',
      tokenFamilyId: 'tf-1',
    }));
    const controller = createController({
      staffAuth: {
        requestPasswordChallenge: vi.fn(),
        updateCredentialAndRotateSession,
      },
    });
    const response = mockResponseWithOptions();
    const body = { currentPassword: 'the-current-password', newPassword: 'a-new-strong-password' };

    const result = await controller.staffPasswordChange(principal, body as never, response);

    expect(updateCredentialAndRotateSession).toHaveBeenCalledWith({
      userId: 'seed_dev_admin',
      currentSessionId: 'session-1',
      currentPassword: 'the-current-password',
      newPassword: 'a-new-strong-password',
    });
    expect(result).toEqual({ data: {} });
    expect(response.calls.map(call => call.name)).toEqual(['iranyaragh_dev_refresh', 'iranyaragh_dev_csrf']);
    expect(response.calls[0]).toMatchObject({ value: 'new-rt-1' });
    expect(response.calls[0].options).toMatchObject({ httpOnly: true });
    expect(response.calls[1]).toMatchObject({ value: 'new-csrf-1', options: { httpOnly: false } });
  });

  it('propagates a rejected current-password failure from the change service unchanged', async () => {
    const updateCredentialAndRotateSession = vi.fn(async () => {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'dummy' });
    });
    const controller = createController({
      staffAuth: { requestPasswordChallenge: vi.fn(), updateCredentialAndRotateSession },
    });
    const response = mockResponseWithOptions();

    await expect(
      controller.staffPasswordChange(principal, { currentPassword: 'wrong', newPassword: 'a-new-strong-password' } as never, response),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(response.calls).toEqual([]);
  });
});

describe('StaffAuthController (recovery regeneration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes the current session when regenerating recovery codes', async () => {
    const regenerateRecoveryCodes = vi.fn(async () => ({
      data: { recoveryCodes: ['RECOVERY-1'] },
    }));
    const controller = createController({ staffMfa: { verifyTotp: vi.fn(), regenerateRecoveryCodes } });

    const result = await controller.recoveryRegenerate(principal);

    expect(regenerateRecoveryCodes).toHaveBeenCalledWith('seed_dev_admin', 'session-1');
    expect(result.data.recoveryCodes).toEqual(['RECOVERY-1']);
  });
});
