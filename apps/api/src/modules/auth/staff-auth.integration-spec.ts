import { randomUUID } from 'node:crypto';
import { UserStatus } from '@prisma/client';
import { generate } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuthHashService } from './auth-hash.service';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthTokenService } from './auth-token.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthPrincipalService } from './auth-principal.service';
import { AuthSessionService } from './auth-session.service';
import { PasswordHashService } from './password-hash.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffMfaService } from './staff-mfa.service';
import { TotpCryptoService } from './totp-crypto.service';

const runtimeConfig: AuthRuntimeConfig = {
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-staff-auth-integration',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: { version: 1, secret: 'integration-hash-secret-32-bytes-minimum' },
  devLoginEnabled: false,
  devCode: '',
  cookies: { refreshName: 'refresh', csrfName: 'csrf', secure: false, sameSite: 'strict', path: '/' },
  totpEncryptionKey: Buffer.alloc(32, 9).toString('base64url'),
};

describe.sequential('StaffAuthService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `staff_auth_user_${runId}`;
  const email = `staff-auth-${runId}@example.com`;
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const tokens = new AuthTokenService(runtimeConfig);
  const passwords = new PasswordHashService();
  const limits = { enforce: async () => undefined, reset: async () => undefined };
  const sessions = new AuthSessionService(prisma, hashes, tokens);
  const service = new StaffAuthService(prisma, hashes, tokens, passwords, limits as never, sessions);
  const permissions = new AuthPermissionService(prisma);
  const principals = new AuthPrincipalService(prisma, tokens, permissions);
  const crypto = new TotpCryptoService(runtimeConfig);
  const mfa = new StaffMfaService(prisma, hashes, tokens, sessions, principals, limits as never, crypto);
  const totpSecret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const recoveryCode = 'RECOVERY-ONE-2026';
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        passwordHash: await passwords.hash('a secure staff password'),
        status: UserStatus.ACTIVE,
      },
    });
    const encrypted = crypto.encrypt(totpSecret);
    const credentialCreatedAt = new Date(Date.now() - 1_000);
    await prisma.totpCredential.create({
      data: {
        userId,
        encryptedSecret: encrypted.encryptedSecret,
        encryptionKeyVersion: encrypted.encryptionKeyVersion,
        createdAt: credentialCreatedAt,
        confirmedAt: new Date(),
      },
    });
    const credential = await prisma.totpCredential.findUniqueOrThrow({ where: { userId } });
    await prisma.recoveryCode.create({
      data: { totpCredentialId: credential.id, codeHash: hashes.hash(recoveryCode, 'recovery-code') },
    });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: userId }, { entityId: userId }] } });
    await prisma.loginAttempt.deleteMany({ where: { userId } });
    await prisma.mfaChallenge.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('verifies the exact password and creates a single-use MFA challenge', async () => {
    const result = await service.requestPasswordChallenge({
      identifier: email.toUpperCase(),
      password: 'a secure staff password',
      ipAddress: '192.0.2.44',
    });

    expect(result.data.next).toBe('TOTP');
    expect(result.data.expiresInSeconds).toBe(300);
    const challenge = await prisma.mfaChallenge.findFirstOrThrow({ where: { userId } });
    expect(challenge.challengeTokenHash).not.toContain(result.data.challengeToken);
    expect(challenge.consumedAt).toBeNull();
    expect(await prisma.mfaChallenge.count({ where: { userId, invalidatedAt: null, consumedAt: null } })).toBe(1);
  });

  it('records a generic failure and never creates a challenge for a wrong password', async () => {
    await expect(
      service.requestPasswordChallenge({ identifier: email, password: 'wrong password value', ipAddress: '192.0.2.45' }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_INVALID_CREDENTIALS' }, status: 401 });
    await expect(prisma.loginAttempt.count({ where: { userId, outcome: 'INVALID_CREDENTIALS' } })).resolves.toBe(1);
  });

  it('consumes a valid TOTP challenge once and rejects same-step replay', async () => {
    const password = await service.requestPasswordChallenge({
      identifier: email,
      password: 'a secure staff password',
      ipAddress: '192.0.2.46',
    });
    const code = await generate({ secret: totpSecret });
    const result = await mfa.verifyTotp({
      challengeToken: password.data.challengeToken,
      code,
      ipAddress: '192.0.2.46',
      deviceName: 'Integration device',
    });

    expect(result.response.data.principal.authenticationLevel).toBe('STAFF_MFA');
    await expect(
      mfa.verifyTotp({ challengeToken: password.data.challengeToken, code, ipAddress: '192.0.2.46' }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_CHALLENGE_INVALID' }, status: 401 });
    await expect(prisma.session.count({ where: { userId, revokedAt: null } })).resolves.toBe(1);

    const recoveryChallenge = await service.requestPasswordChallenge({
      identifier: email,
      password: 'a secure staff password',
      ipAddress: '192.0.2.47',
    });
    const recoveryResult = await mfa.verifyRecovery({
      challengeToken: recoveryChallenge.data.challengeToken,
      code: recoveryCode,
      ipAddress: '192.0.2.47',
    });
    expect(recoveryResult.response.data.principal.authenticationLevel).toBe('STAFF_MFA');
    await expect(
      mfa.verifyRecovery({ challengeToken: recoveryChallenge.data.challengeToken, code: recoveryCode, ipAddress: '192.0.2.47' }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_CHALLENGE_INVALID' }, status: 401 });
  });

  it('changes the password only with the live current password and refuses a wrong one', async () => {
    const secondarySession = await sessions.createSession({
      userId,
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: new Date(),
      deviceName: 'Other family device',
    });
    const current = await sessions.createSession({
      userId,
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: new Date(),
      deviceName: 'Password change device',
    });
    const currentSessionId = current.sessionId;
    const knownSessions = await prisma.session.findMany({ where: { userId, revokedAt: null }, select: { tokenFamilyId: true } });

    await expect(
      service.changePassword({
        userId,
        currentSessionId,
        currentPassword: 'not-the-password',
        newPassword: 'a brand new strong password',
      }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_INVALID_CREDENTIALS' }, status: 401 });

    const issued = await service.changePassword({
      userId,
      currentSessionId,
      currentPassword: 'a secure staff password',
      newPassword: 'a brand new strong password',
    });
    expect(issued.sessionId).not.toBe(currentSessionId);

    await expect(
      service.requestPasswordChallenge({ identifier: email, password: 'a secure staff password', ipAddress: '192.0.2.49' }),
    ).rejects.toMatchObject({ response: { code: 'AUTH_INVALID_CREDENTIALS' }, status: 401 });

    const newChallenge = await service.requestPasswordChallenge({
      identifier: email,
      password: 'a brand new strong password',
      ipAddress: '192.0.2.49',
    });
    expect(newChallenge.data.next).toBe('TOTP');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordChangedAt: true } });
    expect(stored.passwordChangedAt).not.toBeNull();

    const liveFamiliesAfter = await prisma.session.findMany({
      where: { userId, revokedAt: null },
      distinct: ['tokenFamilyId'],
      select: { tokenFamilyId: true },
    });
    const originalFamilies = new Set(knownSessions.map(session => session.tokenFamilyId));
    const liveFamiliesAfterSet = new Set(liveFamiliesAfter.map(session => session.tokenFamilyId));
    expect(originalFamilies.size).toBeGreaterThan(1);
    expect(liveFamiliesAfterSet.size).toBe(1);
    expect([...originalFamilies].some(family => family !== issued.tokenFamilyId && liveFamiliesAfterSet.has(family))).toBe(false);
    expect(secondarySession.tokenFamilyId).not.toBe(current.tokenFamilyId);

    const passwordChangedAudits = await prisma.auditLog.count({
      where: { actorId: userId, action: 'auth.password.changed' },
    });
    expect(passwordChangedAudits).toBe(1);
  });

  it('regenerates recovery codes and revokes every other session family while keeping the current one', async () => {
    const secondary = await sessions.createSession({
      userId,
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: new Date(),
      deviceName: 'Other family device',
    });
    const current = await sessions.createSession({
      userId,
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: new Date(),
      deviceName: 'Regeneration device',
    });
    const credential = await prisma.totpCredential.findUniqueOrThrow({ where: { userId } });
    const familyAuditsBefore = await prisma.auditLog.count({
      where: { actorId: userId, action: 'auth.session.all_revoked' },
    });

    const result = await mfa.regenerateRecoveryCodes(userId, current.sessionId);

    expect(result.data.recoveryCodes).toHaveLength(10);
    const activeCodesAfter = await prisma.recoveryCode.count({
      where: { totpCredentialId: credential.id, consumedAt: null, invalidatedAt: null },
    });
    expect(activeCodesAfter).toBe(10);

    const currentRow = await prisma.session.findUniqueOrThrow({ where: { id: current.sessionId } });
    expect(currentRow.revokedAt).toBeNull();

    const liveFamiliesAfter = await prisma.session.findMany({
      where: { userId, revokedAt: null },
      distinct: ['tokenFamilyId'],
      select: { tokenFamilyId: true },
    });
    expect(liveFamiliesAfter.map(session => session.tokenFamilyId)).toEqual([current.tokenFamilyId]);

    const secondaryRow = await prisma.session.findUniqueOrThrow({ where: { id: secondary.sessionId } });
    expect(secondaryRow.revokedAt).not.toBeNull();
    expect(secondaryRow.revokeReason).toBe('CREDENTIAL_CHANGED');

    const familyAuditsAfter = await prisma.auditLog.count({
      where: { actorId: userId, action: 'auth.session.all_revoked' },
    });
    expect(familyAuditsAfter).toBe(familyAuditsBefore + 1);
    const regenerateAudit = await prisma.auditLog.count({
      where: { actorId: userId, action: 'auth.recovery_regenerated' },
    });
    expect(regenerateAudit).toBe(1);
  });
});
