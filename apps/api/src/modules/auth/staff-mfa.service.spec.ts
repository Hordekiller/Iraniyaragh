import { ConflictException } from '@nestjs/common';
import { LoginAttemptOutcome, LoginMethod, MfaChallengePurpose, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHashService } from './auth-hash.service';
import type { AuthPrincipalService } from './auth-principal.service';
import type { AuthSessionService } from './auth-session.service';
import type { AuthTokenService } from './auth-token.service';
import type { RateLimitService } from './rate-limit.service';
import { StaffMfaException, StaffMfaService } from './staff-mfa.service';
import type { TotpCryptoService } from './totp-crypto.service';
import type { PrismaService } from '../../database/prisma.service';

const { verifyMock, generateSecretMock, generateUriMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(),
  generateSecretMock: vi.fn(),
  generateUriMock: vi.fn(),
}));

vi.mock('otplib', () => ({
  verify: (...args: unknown[]) => verifyMock(...args),
  generateSecret: (...args: unknown[]) => generateSecretMock(...args),
  generateURI: (...args: unknown[]) => generateUriMock(...args),
}));

type MockTx = {
  totpCredential: {
    upsert: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  recoveryCode: {
    deleteMany: ReturnType<typeof vi.fn>;
    createMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mfaChallenge: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  user: {
    update: ReturnType<typeof vi.fn>;
  };
  loginAttempt: {
    create: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

function createTx(): MockTx {
  return {
    totpCredential: {
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    recoveryCode: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async () => ({ count: 10 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    mfaChallenge: {
      findUnique: vi.fn(async () => ({ attempts: 0, maxAttempts: 5 })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { update: vi.fn(async () => ({})) },
    loginAttempt: { create: vi.fn(async () => ({})) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

function serviceWith(overrides: {
  tx?: MockTx;
  user?: ReturnType<typeof vi.fn>;
  totpCredential?: ReturnType<typeof vi.fn>;
  mfaChallenge?: ReturnType<typeof vi.fn>;
  recoveryCode?: ReturnType<typeof vi.fn>;
  hashes?: Pick<AuthHashService, 'hash' | 'candidateHashes'>;
  crypto?: Pick<TotpCryptoService, 'encrypt' | 'decrypt'>;
  createSession?: ReturnType<typeof vi.fn>;
  reset?: ReturnType<typeof vi.fn>;
  enforce?: ReturnType<typeof vi.fn>;
  resolveBearerToken?: ReturnType<typeof vi.fn>;
}) {
  const tx = overrides.tx ?? createTx();
  const prisma = {
    user: { findUnique: overrides.user ?? vi.fn(async () => ({ id: 'user-1', email: 'staff@example.com' })) },
    totpCredential: { findUnique: overrides.totpCredential ?? vi.fn(async () => null) },
    mfaChallenge: { findFirst: overrides.mfaChallenge ?? vi.fn(async () => null) },
    recoveryCode: { findFirst: overrides.recoveryCode ?? vi.fn(async () => null) },
    $transaction: vi.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(tx)),
  } as unknown as PrismaService;

  const hashes = overrides.hashes ?? {
    hash: vi.fn((value: string) => `hash:${value}`),
    candidateHashes: vi.fn((value: string) => [`hash:${value}`]),
  };
  const tokens = { generateMfaChallengeToken: vi.fn(() => 'challenge-1') } as unknown as AuthTokenService;
  const sessions = {
    createSession: overrides.createSession ?? vi.fn(async () => ({
      accessToken: 'at-1',
      csrfToken: 'csrf-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'rt-1',
      sessionId: 'session-1',
      tokenFamilyId: 'tf-1',
    })),
  } as unknown as AuthSessionService;
  const principals = {
    resolveBearerToken: overrides.resolveBearerToken ?? vi.fn(async () => ({
      userId: 'user-1',
      sessionId: 'session-1',
      authenticationLevel: 'STAFF_MFA',
      permissions: ['catalog.read', 'catalog.write'],
      authenticatedAt: new Date(),
      accessExpiresAt: new Date(Date.now() + 600_000),
    })),
  } as unknown as AuthPrincipalService;
  const limits = {
    enforce: overrides.enforce ?? vi.fn(async () => undefined),
    reset: overrides.reset ?? vi.fn(async () => undefined),
  } as unknown as RateLimitService;
  const crypto = overrides.crypto ?? {
    encrypt: vi.fn((secret: string) => ({ encryptedSecret: `enc:${secret}`, encryptionKeyVersion: 1 })),
    decrypt: vi.fn((value: string) => value.replace(/^enc:/, '')),
  };

  const service = new StaffMfaService(
    prisma,
    hashes as AuthHashService,
    tokens as AuthTokenService,
    sessions as AuthSessionService,
    principals as AuthPrincipalService,
    limits as RateLimitService,
    crypto as TotpCryptoService,
  );
  return { service, prisma, hashes, tokens, sessions, principals, limits, crypto, tx };
}

const verified = { valid: true, timeStep: 42 };
const invalid = { valid: false };

describe('StaffMfaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateSecretMock.mockReturnValue('JBSWY3DPEHPK3PXP');
    generateUriMock.mockReturnValue('otpauth://totp/Iraniyaragh:staff@example.com?secret=JBSWY3DPEHPK3PXP&period=30&digits=6');
    verifyMock.mockReturnValue(invalid);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('beginTotpEnrollment', () => {
    it('returns a provisioning URI for a new enrollment', async () => {
      const { service } = serviceWith({
        user: vi.fn(async () => ({ id: 'user-1', email: 'staff@example.com' })),
      });

      const result = await service.beginTotpEnrollment('user-1');

      expect(result.data.secret).toBeTruthy();
      expect(result.data.provisioningUri).toContain('totp/');
      expect(result.data.expiresInSeconds).toBe(300);
    });

    it('throws when the enrolling user does not exist', async () => {
      const { service } = serviceWith({ user: vi.fn(async () => null) });
      await expect(service.beginTotpEnrollment('nope')).rejects.toBeInstanceOf(StaffMfaException);
    });

    it('throws a conflict when TOTP is already confirmed and enabled', async () => {
      const { service } = serviceWith({
        totpCredential: vi.fn(async () => ({ confirmedAt: new Date(), disabledAt: null })),
      });
      await expect(service.beginTotpEnrollment('user-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('re-enrolls when a previous credential was disabled', async () => {
      const tx = createTx();
      const { service } = serviceWith({
        user: vi.fn(async () => ({ id: 'user-1', email: 'staff@example.com' })),
        totpCredential: vi.fn(async () => ({ confirmedAt: new Date(), disabledAt: new Date() })),
        tx,
      });

      const result = await service.beginTotpEnrollment('user-1');
      expect(result.data.secret).toBeTruthy();
      expect(tx.totpCredential.upsert).toHaveBeenCalled();
    });
  });

  describe('confirmTotp', () => {
    it('confirms the credential and issues recovery codes', async () => {
      verifyMock.mockReturnValue(verified);
      const tx = createTx();
      const { service } = serviceWith({
        totpCredential: vi.fn(async () => ({
          id: 'cred-1',
          encryptedSecret: 'enc:plain-secret',
          confirmedAt: null,
          disabledAt: null,
        })),
        tx,
      });

      const result = await service.confirmTotp('user-1', '123456');
      expect(result.data.recoveryCodes).toHaveLength(10);
      expect(result.data.recoveryCodes[0]).toMatch(/^RECOVERY-/u);
      expect(tx.totpCredential.updateMany).toHaveBeenCalledWith({
        where: { id: 'cred-1', confirmedAt: null, disabledAt: null },
        data: { confirmedAt: expect.any(Date), lastAcceptedStep: expect.any(Number) },
      });
      expect(tx.recoveryCode.deleteMany).toHaveBeenCalledWith({ where: { totpCredentialId: 'cred-1' } });
      expect(tx.recoveryCode.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ totpCredentialId: 'cred-1', codeHash: expect.stringContaining('hash:RECOVERY-') }),
        ]),
      });
    });

    it('throws when the credential is missing, confirmed, or disabled', async () => {
      const { service } = serviceWith({ totpCredential: vi.fn(async () => null) });
      await expect(service.confirmTotp('user-1', '123456')).rejects.toBeInstanceOf(StaffMfaException);
    });

    it('throws when the code does not verify', async () => {
      const { service } = serviceWith({
        totpCredential: vi.fn(async () => ({
          id: 'cred-1',
          encryptedSecret: 'enc:plain-secret',
          confirmedAt: null,
          disabledAt: null,
        })),
      });
      await expect(service.confirmTotp('user-1', '999999')).rejects.toBeInstanceOf(StaffMfaException);
    });
  });

  describe('regenerateRecoveryCodes', () => {
    it('regenerates recovery codes for a confirmed credential', async () => {
      const tx = createTx();
      const { service } = serviceWith({
        totpCredential: vi.fn(async () => ({ id: 'cred-1', confirmedAt: new Date(), disabledAt: null })),
        tx,
      });

      const result = await service.regenerateRecoveryCodes('user-1');
      expect(result.data.recoveryCodes).toHaveLength(10);
      expect(tx.recoveryCode.updateMany).toHaveBeenCalledWith({
        where: { totpCredentialId: 'cred-1', consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: expect.any(Date) },
      });
    });

    it('throws for an unconfirmed or disabled credential', async () => {
      const { service } = serviceWith({
        totpCredential: vi.fn(async () => ({ id: 'cred-1', confirmedAt: null, disabledAt: null })),
      });
      await expect(service.regenerateRecoveryCodes('user-1')).rejects.toBeInstanceOf(StaffMfaException);
    });
  });

  describe('verifyTotp', () => {
    const challenge = {
      id: 'challenge-1',
      purpose: MfaChallengePurpose.STAFF_SIGN_IN,
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      user: {
        id: 'user-1',
        email: 'staff@example.com',
        status: UserStatus.ACTIVE,
        totpCredential: {
          id: 'cred-1',
          encryptedSecret: 'enc:secret',
          confirmedAt: new Date(),
          disabledAt: null,
          lastAcceptedStep: null,
        },
      },
    };

    it('consumes the challenge and issues a staff session on success', async () => {
      verifyMock.mockReturnValue(verified);
      const tx = createTx();
      const createSession = vi.fn(async () => ({
        accessToken: 'at-1',
        csrfToken: 'csrf-1',
        expiresAt: new Date(Date.now() + 600_000),
        refreshToken: 'rt-1',
        sessionId: 'session-1',
        tokenFamilyId: 'tf-1',
      }));
      const reset = vi.fn(async () => undefined);
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => challenge),
        createSession,
        reset,
        tx,
      });

      const result = await service.verifyTotp({ challengeToken: 'challenge-1', code: '123456' });

      expect(result.response.data.accessToken).toBe('at-1');
      expect(result.response.data.principal.userId).toBe('user-1');
      expect(result.refreshToken).toBe('rt-1');
      expect(result.csrfToken).toBe('csrf-1');
      expect(tx.mfaChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: 'challenge-1', consumedAt: null, invalidatedAt: null, attempts: { lt: 5 } },
        data: { consumedAt: expect.any(Date) },
      });
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ method: LoginMethod.TOTP, outcome: LoginAttemptOutcome.SUCCESS }),
        }),
      );
      expect(createSession).toHaveBeenCalledWith({
        userId: 'user-1',
        authenticationLevel: 'STAFF_MFA',
        authenticatedAt: expect.any(Date),
        deviceName: undefined,
        ipAddress: 'unknown',
        userAgent: undefined,
      });
      expect(reset).toHaveBeenCalledTimes(2);
    });

    it('throws on an invalid code and records a failed attempt', async () => {
      const tx = createTx();
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => challenge),
        tx,
      });

      await expect(
        service.verifyTotp({ challengeToken: 'challenge-1', code: '999999' }),
      ).rejects.toBeInstanceOf(StaffMfaException);

      expect(tx.mfaChallenge.findUnique).toHaveBeenCalled();
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: LoginAttemptOutcome.INVALID_CODE }),
        }),
      );
    });

    it('throws when the challenge is missing or not a staff sign-in', async () => {
      const { service } = serviceWith({ mfaChallenge: vi.fn(async () => null) });
      await expect(
        service.verifyTotp({ challengeToken: 'x', code: '123456' }),
      ).rejects.toBeInstanceOf(StaffMfaException);
    });

    it('throws when the challenge or user state is ineligible', async () => {
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => ({ ...challenge, consumedAt: new Date() })),
      });
      await expect(
        service.verifyTotp({ challengeToken: 'x', code: '123456' }),
      ).rejects.toBeInstanceOf(StaffMfaException);
    });

    it('throws when the credential is disabled', async () => {
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => ({
          ...challenge,
          user: { ...challenge.user, totpCredential: { ...challenge.user.totpCredential, disabledAt: new Date() } },
        })),
      });
      await expect(
        service.verifyTotp({ challengeToken: 'x', code: '123456' }),
      ).rejects.toBeInstanceOf(StaffMfaException);
    });
  });

  describe('verifyRecovery', () => {
    const challenge = {
      id: 'challenge-1',
      purpose: MfaChallengePurpose.STAFF_SIGN_IN,
      consumedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      attempts: 0,
      maxAttempts: 5,
      user: {
        id: 'user-1',
        email: 'staff@example.com',
        status: UserStatus.ACTIVE,
        totpCredential: { id: 'cred-1', encryptedSecret: 'enc:secret', confirmedAt: new Date(), disabledAt: null },
      },
    };

    it('consumes a valid recovery code and issues a session', async () => {
      const tx = createTx();
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => challenge),
        recoveryCode: vi.fn(async () => ({ id: 'rc-1' })),
        tx,
      });

      const result = await service.verifyRecovery({ challengeToken: 'challenge-1', code: 'RECOVERY-ABCD' });
      expect(result.response.data.accessToken).toBe('at-1');
      expect(tx.recoveryCode.updateMany).toHaveBeenCalledWith({
        where: { id: 'rc-1', consumedAt: null, invalidatedAt: null },
        data: { consumedAt: expect.any(Date) },
      });
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ method: LoginMethod.RECOVERY_CODE, outcome: LoginAttemptOutcome.SUCCESS }),
        }),
      );
    });

    it('throws and records a failure for an invalid recovery code', async () => {
      const tx = createTx();
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => challenge),
        recoveryCode: vi.fn(async () => null),
        tx,
      });

      await expect(
        service.verifyRecovery({ challengeToken: 'challenge-1', code: 'NOPE' }),
      ).rejects.toBeInstanceOf(StaffMfaException);
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: LoginAttemptOutcome.INVALID_CODE }),
        }),
      );
    });

    it('throws when the challenge is ineligible', async () => {
      const { service } = serviceWith({
        mfaChallenge: vi.fn(async () => ({ ...challenge, invalidatedAt: new Date() })),
      });
      await expect(
        service.verifyRecovery({ challengeToken: 'x', code: 'RECOVERY-ABCD' }),
      ).rejects.toBeInstanceOf(StaffMfaException);
    });
  });
});