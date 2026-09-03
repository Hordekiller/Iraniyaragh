import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { StaffAuthController } from './staff-auth.controller';
import type { AuthRuntimeConfig } from './auth.config';
import type { AuthHashService } from './auth-hash.service';
import type { AuthSessionService } from './auth-session.service';
import type { AuthPrincipalContext, AuthPrincipalService } from './auth-principal.service';
import type { PrismaService } from '../../database/prisma.service';
import type { StaffDevSignInDto } from './staff-auth.dto';

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
  sessions: Pick<AuthSessionService, 'createSession' | 'revokeSession'>;
  principals: Pick<AuthPrincipalService, 'resolveBearerToken'>;
  prisma: Pick<PrismaService, 'user'>;
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
    revokeSession: vi.fn(async () => true),
  };
  const principals = overrides.principals ?? {
    resolveBearerToken: vi.fn(async () => principal),
  };
  const prisma = overrides.prisma ?? {
    user: {
      findUnique: vi.fn(async () => ({ id: 'seed_dev_admin' })),
    },
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
  });
  return new StaffAuthController(
    config,
    hashes as AuthHashService,
    sessions as AuthSessionService,
    principals as AuthPrincipalService,
    prisma as PrismaService,
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
  return { ip: '127.0.0.1', headers: {} };
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

  it('revokes the session and clears cookies on logout', async () => {
    const revokeSession = vi.fn(async () => true);
    const controller = createController({ sessions: { createSession: vi.fn(), revokeSession } });
    const response = mockResponse();
    const result = await controller.logout(principal, response);
    expect(revokeSession).toHaveBeenCalledWith('seed_dev_admin', 'session-1');
    expect(result).toEqual({ data: {} });
    const cleared = response.calls.filter(call => call.name.endsWith('_refresh') || call.name.endsWith('_csrf'));
    expect(cleared.length).toBe(2);
  });
});
