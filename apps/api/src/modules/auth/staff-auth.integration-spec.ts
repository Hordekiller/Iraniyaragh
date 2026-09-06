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
  const service = new StaffAuthService(prisma, hashes, tokens, passwords, limits as never);
  const sessions = new AuthSessionService(prisma, hashes, tokens);
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
});
