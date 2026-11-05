import { randomUUID } from 'node:crypto';
import { AuthenticationLevel, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthPrincipalService } from './auth-principal.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-auth-refresh-reliability',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: Object.freeze({
    version: 2,
    secret: 'integration-current-hash-secret-32-bytes-minimum',
  }),
  previousHashKey: Object.freeze({
    version: 1,
    secret: 'integration-previous-hash-secret-32-bytes-minimum',
  }),
  cookies: Object.freeze({
    refreshName: '__Host-iranyaragh_refresh',
    csrfName: '__Host-iranyaragh_csrf',
    secure: true,
    sameSite: 'strict',
    path: '/',
  }),
});

describe.sequential('refresh reliability database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const customerId = `reliab_customer_${runId}`;
  const staffId = `reliab_staff_${runId}`;
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const tokens = new AuthTokenService(runtimeConfig);
  const sessions = new AuthSessionService(prisma, hashes, tokens);
  const principals = new AuthPrincipalService(prisma, tokens, new AuthPermissionService(prisma));
  let connected = false;

  const login = (userId: string, level: AuthenticationLevel) =>
    sessions.createSession({ userId, authenticationLevel: level, authenticatedAt: new Date(Date.now() - 1_000) });
  const bearer = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    for (const id of [customerId, staffId]) {
      await prisma.user.create({ data: { id, email: `${id}@example.com`, status: UserStatus.ACTIVE } });
    }
  });

  afterAll(async () => {
    if (!connected) return;
    const ids = [customerId, staffId];
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  it('keeps an access token issued before a rotation valid until it expires, resolving to the live session', async () => {
    const first = await login(customerId, AuthenticationLevel.CUSTOMER_OTP);
    const second = await sessions.rotateSession(first.refreshToken, AuthenticationLevel.CUSTOMER_OTP);
    const third = await sessions.rotateSession(second.refreshToken, AuthenticationLevel.CUSTOMER_OTP);

    for (const token of [first.accessToken, second.accessToken, third.accessToken]) {
      const principal = await principals.resolveBearerToken(bearer(token));
      expect(principal.userId).toBe(customerId);
      expect(principal.sessionId).toBe(third.sessionId);
    }
  });

  it('lets simultaneous requests carrying the pre-rotation token succeed while a refresh rotates', async () => {
    const issued = await login(customerId, AuthenticationLevel.CUSTOMER_OTP);
    const [rotated, ...resolved] = await Promise.all([
      sessions.rotateSession(issued.refreshToken, AuthenticationLevel.CUSTOMER_OTP),
      ...Array.from({ length: 6 }, () => principals.resolveBearerToken(bearer(issued.accessToken))),
    ]);
    expect(resolved).toHaveLength(6);
    const after = await principals.resolveBearerToken(bearer(issued.accessToken));
    expect(after.sessionId).toBe(rotated.sessionId);
  });

  it('still revokes every earlier access token on logout', async () => {
    const first = await login(customerId, AuthenticationLevel.CUSTOMER_OTP);
    const second = await sessions.rotateSession(first.refreshToken, AuthenticationLevel.CUSTOMER_OTP);
    expect(await sessions.revokeByRefreshToken(second.refreshToken)).toBe(true);

    for (const token of [first.accessToken, second.accessToken]) {
      await expect(principals.resolveBearerToken(bearer(token))).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    }
  });

  it('still revokes every earlier access token when replay is detected', async () => {
    const first = await login(customerId, AuthenticationLevel.CUSTOMER_OTP);
    const second = await sessions.rotateSession(first.refreshToken, AuthenticationLevel.CUSTOMER_OTP);
    await expect(sessions.rotateSession(first.refreshToken, AuthenticationLevel.CUSTOMER_OTP)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_REPLAYED' });

    for (const token of [first.accessToken, second.accessToken]) {
      await expect(principals.resolveBearerToken(bearer(token))).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    }
  });

  it('does not let an access token survive a credential change', async () => {
    const first = await login(staffId, AuthenticationLevel.STAFF_MFA);
    const replacement = await sessions.rotateSessionAfterCredentialChange({
      userId: staffId,
      currentSessionId: first.sessionId,
      passwordHash: `argon2-fake-${randomUUID()}`,
      passwordChangedAt: new Date(),
    });
    await expect(principals.resolveBearerToken(bearer(first.accessToken))).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    await expect(principals.resolveBearerToken(bearer(replacement.accessToken))).resolves.toMatchObject({ sessionId: replacement.sessionId });
    await sessions.revokeAllSessions(staffId);
  });

  it('rotates only within the requesting realm and never revokes the other realm session', async () => {
    const staff = await login(staffId, AuthenticationLevel.STAFF_MFA);
    const customer = await login(customerId, AuthenticationLevel.CUSTOMER_OTP);

    await expect(sessions.rotateSession(staff.refreshToken, AuthenticationLevel.CUSTOMER_OTP)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    await expect(sessions.rotateSession(customer.refreshToken, AuthenticationLevel.STAFF_MFA)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });

    // The wrong-realm attempts consumed and revoked nothing.
    await expect(principals.resolveBearerToken(bearer(staff.accessToken))).resolves.toMatchObject({ userId: staffId });
    await expect(principals.resolveBearerToken(bearer(customer.accessToken))).resolves.toMatchObject({ userId: customerId });
    await expect(sessions.rotateSession(staff.refreshToken, AuthenticationLevel.STAFF_MFA)).resolves.toMatchObject({ tokenFamilyId: staff.tokenFamilyId });
    await expect(sessions.rotateSession(customer.refreshToken, AuthenticationLevel.CUSTOMER_OTP)).resolves.toMatchObject({ tokenFamilyId: customer.tokenFamilyId });
  });
});
