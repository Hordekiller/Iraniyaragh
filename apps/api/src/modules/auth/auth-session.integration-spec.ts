import { randomUUID } from 'node:crypto';
import { AuthenticationLevel, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import {
  AUTH_SESSION_REVOKE_REASON,
  AuthSessionException,
  AuthSessionService,
} from './auth-session.service';
import { AuthTokenService } from './auth-token.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-auth-session-integration',
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
  devLoginEnabled: false,
  devCode: '',
});

describe.sequential('AuthSessionService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `auth_session_user_${runId}`;
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const tokens = new AuthTokenService(runtimeConfig);
  const sessions = new AuthSessionService(prisma, hashes, tokens);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
    await prisma.user.create({
      data: {
        id: userId,
        email: `auth-session-${runId}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: userId }, { entityId: userId }] },
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates only hashed refresh/device/IP persistence and safe audit evidence', async () => {
    const authenticatedAt = new Date(Date.now() - 1_000);
    const issued = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.STAFF_MFA,
      authenticatedAt,
      deviceId: 'integration-device-id',
      deviceName: '  Operations laptop  ',
      ipAddress: '192.0.2.10',
      userAgent: 'Integration Browser/1.0',
    });

    const stored = await prisma.session.findUniqueOrThrow({ where: { id: issued.sessionId } });
    expect(hashes.verify(issued.refreshToken, stored.refreshTokenHash, 'refresh')).toBe(true);
    expect(stored).toMatchObject({
      userId,
      authenticationLevel: AuthenticationLevel.STAFF_MFA,
      deviceName: 'Operations laptop',
      tokenFamilyId: issued.tokenFamilyId,
    });
    expect(stored.refreshTokenHash).not.toContain(issued.refreshToken);
    expect(stored.deviceIdHash).not.toBe('integration-device-id');
    expect(stored.ipHash).not.toBe('192.0.2.10');

    const verifiedAccess = tokens.verifyAccessToken(issued.accessToken);
    expect(verifiedAccess).toMatchObject({
      userId,
      sessionId: issued.sessionId,
      authenticationLevel: 'STAFF_MFA',
    });

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'auth.session.created', entityId: issued.sessionId },
    });
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(issued.refreshToken);
    expect(serializedAudit).not.toContain(issued.csrfToken);
    expect(serializedAudit).not.toContain('192.0.2.10');
    expect(serializedAudit).not.toContain('integration-device-id');
  });

  it('accepts only the configured previous refresh-hash version and rotates it to the current key', async () => {
    const previousHashes = new AuthHashService(
      Object.freeze({
        ...runtimeConfig,
        currentHashKey: runtimeConfig.previousHashKey!,
        previousHashKey: undefined,
      }),
    );
    const rawRefreshToken = tokens.generateRefreshToken();
    const now = new Date();
    const sessionId = randomUUID();
    await prisma.session.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: previousHashes.hash(rawRefreshToken, 'refresh'),
        tokenFamilyId: tokens.generateTokenFamilyId(),
        authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
        authenticatedAt: new Date(now.getTime() - 1_000),
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
        createdAt: now,
      },
    });

    const rotated = await sessions.rotateSession(rawRefreshToken);
    const replacement = await prisma.session.findUniqueOrThrow({ where: { id: rotated.sessionId } });
    expect(replacement.refreshTokenHash.startsWith('v2:')).toBe(true);
    expect(hashes.verify(rotated.refreshToken, replacement.refreshTokenHash, 'refresh')).toBe(true);
  });

  it('rotates once, preserves absolute/auth evidence, and revokes the family on sequential replay', async () => {
    const issued = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    const rotated = await sessions.rotateSession(issued.refreshToken);

    const [original, replacement] = await Promise.all([
      prisma.session.findUniqueOrThrow({ where: { id: issued.sessionId } }),
      prisma.session.findUniqueOrThrow({ where: { id: rotated.sessionId } }),
    ]);
    expect(original).toMatchObject({
      revokedAt: expect.any(Date),
      revokeReason: AUTH_SESSION_REVOKE_REASON.rotated,
      replacedBySessionId: replacement.id,
    });
    expect(replacement).toMatchObject({
      revokedAt: null,
      expiresAt: original.expiresAt,
      authenticatedAt: original.authenticatedAt,
      authenticationLevel: original.authenticationLevel,
      tokenFamilyId: original.tokenFamilyId,
    });
    expect(hashes.verify(rotated.refreshToken, replacement.refreshTokenHash, 'refresh')).toBe(true);

    await expectAuthError(sessions.rotateSession(issued.refreshToken), 'AUTH_SESSION_REPLAYED');
    await expect(
      prisma.session.count({ where: { tokenFamilyId: issued.tokenFamilyId, revokedAt: null } }),
    ).resolves.toBe(0);
    const revokedReplacement = await prisma.session.findUniqueOrThrow({ where: { id: replacement.id } });
    expect(revokedReplacement.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.replayDetected);
  });

  it('allows one concurrent refresh winner, then the loser detects replay and revokes the family', async () => {
    const issued = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.STAFF_MFA,
      authenticatedAt: new Date(Date.now() - 1_000),
    });

    const outcomes = await Promise.allSettled([
      sessions.rotateSession(issued.refreshToken),
      sessions.rotateSession(issued.refreshToken),
    ]);
    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled');
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      authCode: 'AUTH_SESSION_REPLAYED',
    });
    await expect(
      prisma.session.count({ where: { tokenFamilyId: issued.tokenFamilyId, revokedAt: null } }),
    ).resolves.toBe(0);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'auth.session.replay_detected',
          actorId: userId,
          metadata: { path: ['tokenFamilyId'], equals: issued.tokenFamilyId },
        },
      }),
    ).resolves.toBe(1);
  });

  it('fails closed and revokes the family when the user lifecycle becomes inactive', async () => {
    const issued = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.SUSPENDED } });

    await expectAuthError(sessions.rotateSession(issued.refreshToken), 'AUTH_SESSION_INVALID');
    const stored = await prisma.session.findUniqueOrThrow({ where: { id: issued.sessionId } });
    expect(stored.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.userInactive);
    await prisma.user.update({ where: { id: userId }, data: { status: UserStatus.ACTIVE } });
  });

  it('rejects and records absolute expiry and inactivity without extending deadlines', async () => {
    const now = new Date();
    const expiredToken = tokens.generateRefreshToken();
    const inactiveToken = tokens.generateRefreshToken();
    const expiredSessionId = randomUUID();
    const inactiveSessionId = randomUUID();
    await prisma.session.createMany({
      data: [
        {
          id: expiredSessionId,
          userId,
          refreshTokenHash: hashes.hash(expiredToken, 'refresh'),
          tokenFamilyId: tokens.generateTokenFamilyId(),
          authenticationLevel: AuthenticationLevel.STAFF_MFA,
          authenticatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
          lastUsedAt: new Date(now.getTime() - 90 * 60 * 1_000),
          expiresAt: new Date(now.getTime() - 60 * 60 * 1_000),
        },
        {
          id: inactiveSessionId,
          userId,
          refreshTokenHash: hashes.hash(inactiveToken, 'refresh'),
          tokenFamilyId: tokens.generateTokenFamilyId(),
          authenticationLevel: AuthenticationLevel.STAFF_MFA,
          authenticatedAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1_000),
          lastUsedAt: new Date(now.getTime() - 31 * 60 * 1_000),
          expiresAt: new Date(now.getTime() + 10 * 60 * 60 * 1_000),
        },
      ],
    });

    await expectAuthError(sessions.rotateSession(expiredToken), 'AUTH_SESSION_INVALID');
    await expectAuthError(sessions.rotateSession(inactiveToken), 'AUTH_SESSION_INVALID');
    const [expired, inactive] = await Promise.all([
      prisma.session.findUniqueOrThrow({ where: { id: expiredSessionId } }),
      prisma.session.findUniqueOrThrow({ where: { id: inactiveSessionId } }),
    ]);
    expect(expired.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.expired);
    expect(inactive.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.inactivity);
  });

  it('provides idempotent own-session revoke and audited revoke-all helpers', async () => {
    const first = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    const second = await sessions.createSession({
      userId,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });

    await expect(sessions.revokeSession(userId, first.sessionId)).resolves.toBe(true);
    await expect(sessions.revokeSession(userId, first.sessionId)).resolves.toBe(false);
    await expect(sessions.revokeAllSessions(userId)).resolves.toBeGreaterThanOrEqual(1);
    const storedSecond = await prisma.session.findUniqueOrThrow({ where: { id: second.sessionId } });
    expect(storedSecond.revokeReason).toBe(AUTH_SESSION_REVOKE_REASON.logoutAll);
  });

  it('returns the same generic invalid-session code for malformed and unknown refresh values', async () => {
    await expectAuthError(sessions.rotateSession(''), 'AUTH_SESSION_INVALID');
    await expectAuthError(sessions.rotateSession(tokens.generateRefreshToken()), 'AUTH_SESSION_INVALID');
  });
});

async function expectAuthError(
  operation: Promise<unknown>,
  code: 'AUTH_SESSION_INVALID' | 'AUTH_SESSION_REPLAYED',
): Promise<void> {
  try {
    await operation;
    throw new Error(`Expected ${code}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(AuthSessionException);
    expect(error).toMatchObject({ authCode: code });
    expect((error as AuthSessionException).getStatus()).toBe(401);
    expect((error as AuthSessionException).getResponse()).toMatchObject({
      code,
      message:
        code === 'AUTH_SESSION_REPLAYED'
          ? 'Session replay was detected. Reauthentication is required.'
          : 'The session is missing, expired, revoked, or otherwise invalid.',
    });
  }
}
