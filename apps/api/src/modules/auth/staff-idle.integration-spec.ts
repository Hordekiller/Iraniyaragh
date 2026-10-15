import { randomBytes, randomUUID } from 'node:crypto';
import { Controller, Get, Module, VersioningType, type INestApplication } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiFoundationModule } from '../../common/api-foundation.module';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import {
  AUTH_ACCESS_TOKEN_TTL_SECONDS, AUTH_BROWSER_AUDIENCE, AUTH_CLOCK_TOLERANCE_SECONDS,
  type AuthRuntimeConfig,
} from './auth.config';
import { AuthGuard, CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication } from './auth.guard';
import { AuthHashService } from './auth-hash.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { AUTH_SESSION_REVOKE_REASON, AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';

@Controller('auth/staff-idle-proof')
class StaffIdleProofController {
  @Get('navigation')
  @RequireAuthentication('STAFF_MFA')
  navigation(@CurrentPrincipal() principal: AuthPrincipalContext) {
    return { level: principal.authenticationLevel, authenticatedAt: principal.authenticatedAt.toISOString() };
  }

  @Get('sensitive')
  @RequireFreshAuthentication('STAFF_MFA')
  sensitive() { return { allowed: true }; }
}

describe.sequential('staff idle/access/fresh-auth boundaries over real PostgreSQL and HTTP', () => {
  const userId = `staff_idle_${randomUUID()}`;
  const prisma = new PrismaService();
  const config: AuthRuntimeConfig = {
    accessSigningSecret: randomBytes(48).toString('base64url'),
    issuer: 'isolated-staff-idle-integration',
    audience: AUTH_BROWSER_AUDIENCE,
    accessTokenTtlSeconds: AUTH_ACCESS_TOKEN_TTL_SECONDS,
    clockToleranceSeconds: AUTH_CLOCK_TOLERANCE_SECONDS,
    currentHashKey: { version: 1, secret: randomBytes(48).toString('base64url') },
    cookies: { refreshName: '__Host-iranyaragh_refresh', csrfName: '__Host-iranyaragh_csrf', secure: true, sameSite: 'strict', path: '/' },
  };
  const tokens = new AuthTokenService(config);
  const sessions = new AuthSessionService(prisma, new AuthHashService(config), tokens);
  const principals = new AuthPrincipalService(prisma, tokens, new AuthPermissionService(prisma));
  const audit = new AuditLogService(prisma);
  let app: INestApplication | undefined;
  let baseUrl = '';
  let connected = false;

  @Module({
    imports: [ApiFoundationModule],
    controllers: [StaffIdleProofController],
    providers: [{ provide: APP_GUARD, useValue: new AuthGuard(principals, audit) }],
  })
  class StaffIdleProofModule {}

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.test`, status: 'ACTIVE' } });
    app = await NestFactory.create(StaffIdleProofModule, { logger: false });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    if (!connected) return;
    await prisma.auditLog.deleteMany({ where: { actorId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function request(path: 'navigation' | 'sensitive', accessToken: string) {
    const response = await fetch(`${baseUrl}/api/v1/auth/staff-idle-proof/${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(response.headers.get('etag')).toBeNull();
    return { status: response.status, body: await response.json() as { code?: string; level?: string; authenticatedAt?: string } };
  }

  it.each([5, 10, 11, 29, 30, 31])('keeps %i-minute idle/access expiry separate from fresh MFA and absolute expiry', async (idleMinutes) => {
    const now = Date.now();
    const authenticatedAt = new Date(now - (idleMinutes + 1) * 60_000);
    const issued = await sessions.createSession({ userId, authenticationLevel: 'STAFF_MFA', authenticatedAt });
    const lastActivity = new Date(now - idleMinutes * 60_000);
    await prisma.session.update({ where: { id: issued.sessionId }, data: { createdAt: lastActivity, lastUsedAt: lastActivity } });

    // Sign at the actual issuance time; verification, HTTP guards and DB use the
    // real clock. No sleep, mocked principal, fake response or JWT-validation bypass.
    let agedAccess: string;
    const signingClock = vi.spyOn(Date, 'now').mockReturnValue(lastActivity.getTime());
    try {
      agedAccess = tokens.signAccessToken({ userId, sessionId: issued.sessionId, authenticationLevel: 'STAFF_MFA', authenticatedAt });
    } finally { signingClock.mockRestore(); }
    const before = await request('navigation', agedAccess);
    expect(before.status).toBe(idleMinutes <= 10 ? 200 : 401);
    if (before.status === 401) expect(before.body.code).toBe('AUTH_SESSION_INVALID');

    if (idleMinutes >= 30) {
      await expect(sessions.rotateSession(issued.refreshToken)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
      const stored = await prisma.session.findUniqueOrThrow({ where: { id: issued.sessionId } });
      expect(stored.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.inactivity);
      await expect(prisma.session.count({ where: { tokenFamilyId: issued.tokenFamilyId, revokedAt: null } })).resolves.toBe(0);
      return;
    }

    const rotated = await sessions.rotateSession(issued.refreshToken);
    expect(rotated.sessionId === issued.sessionId).toBe(false);
    expect(rotated.expiresAt.getTime()).toBe(issued.expiresAt.getTime());
    const live = await request('navigation', rotated.accessToken);
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ level: 'STAFF_MFA', authenticatedAt: new Date(Math.floor(authenticatedAt.getTime() / 1000) * 1000).toISOString() });
    const sensitive = await request('sensitive', rotated.accessToken);
    expect(sensitive.status).toBe(401);
    expect(sensitive.body.code).toBe('AUTH_REAUTHENTICATION_REQUIRED');
    // A fresh-MFA rejection does not revoke an otherwise usable session.
    expect((await request('navigation', rotated.accessToken)).status).toBe(200);
    const original = await prisma.session.findUniqueOrThrow({ where: { id: issued.sessionId } });
    const replacement = await prisma.session.findUniqueOrThrow({ where: { id: rotated.sessionId } });
    expect(original.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.rotated);
    expect(replacement.authenticatedAt.getTime()).toBe(authenticatedAt.getTime());
    expect(replacement.expiresAt.getTime()).toBe(issued.expiresAt.getTime());
  });

  it('denies an explicitly revoked staff session despite an unexpired signed access token', async () => {
    const issued = await sessions.createSession({ userId, authenticationLevel: 'STAFF_MFA', authenticatedAt: new Date(Date.now() - 1000) });
    expect((await request('navigation', issued.accessToken)).status).toBe(200);
    expect((await request('sensitive', issued.accessToken)).status).toBe(200);
    await sessions.revokeByRefreshToken(issued.refreshToken);
    const denied = await request('navigation', issued.accessToken);
    expect(denied.status).toBe(401);
    expect(denied.body.code).toBe('AUTH_SESSION_INVALID');
  });
});
