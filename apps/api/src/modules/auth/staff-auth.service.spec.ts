import { BadRequestException } from '@nestjs/common';
import { LoginAttemptOutcome, LoginMethod, MfaChallengePurpose, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHashService } from './auth-hash.service';
import type { AuthTokenService } from './auth-token.service';
import type { PasswordHashService } from './password-hash.service';
import type { RateLimitService } from './rate-limit.service';
import { StaffAuthException, StaffAuthService } from './staff-auth.service';
import { PasswordPolicyError } from './password-hash.service';
import type { PrismaService } from '../../database/prisma.service';

type MockTransaction = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  session: {
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mfaChallenge: {
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  loginAttempt: {
    create: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

function createTransaction(overrides: Partial<MockTransaction> = {}): MockTransaction {
  return {
    user: overrides.user ?? {
      findUnique: vi.fn(async () => ({ failedLoginCount: 0 })),
      findUniqueOrThrow: vi.fn(async () => ({ ...ACTIVE_USER })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    session: overrides.session ?? {
      findUnique: vi.fn(async () => ({ tokenFamilyId: 'family-current' })),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    mfaChallenge: overrides.mfaChallenge ?? {
      updateMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async () => ({ id: 'challenge-1' })),
    },
    loginAttempt: overrides.loginAttempt ?? {
      create: vi.fn(async () => ({})),
    },
    auditLog: overrides.auditLog ?? {
      create: vi.fn(async () => ({})),
    },
  };
}

function createService(overrides: {
  user?: ReturnType<typeof vi.fn>;
  transaction?: MockTransaction;
  hashes?: Pick<AuthHashService, 'hash' | 'candidateHashes'>;
  tokens?: Pick<AuthTokenService, 'generateMfaChallengeToken'>;
  passwords?: Pick<PasswordHashService, 'verify' | 'needsRehash' | 'hash'>;
  enforce?: ReturnType<typeof vi.fn>;
} = {}) {
  const transaction = overrides.transaction ?? createTransaction();
  const prisma = {
    user: {
      findUnique: overrides.user ?? vi.fn(async () => null),
    },
    $transaction: vi.fn(async (callback: (tx: MockTransaction) => Promise<unknown>) => callback(transaction)),
  } as unknown as PrismaService;
  const hashes = overrides.hashes ?? {
    hash: vi.fn((value: string) => `hash:${value}`),
    candidateHashes: vi.fn((value: string) => [`hash:${value}`]),
  };
  const tokens = overrides.tokens ?? {
    generateMfaChallengeToken: vi.fn(() => 'challenge-token-1'),
  };
  const passwords = overrides.passwords ?? {
    verify: vi.fn(async () => true),
    needsRehash: vi.fn(() => false),
    hash: vi.fn(async (value: string) => `argon2:${value}`),
    assertPolicy: vi.fn(() => {}),
  };
  const rateLimits = {
    enforce: overrides.enforce ?? vi.fn(async () => undefined),
  } as unknown as RateLimitService;

  const service = new StaffAuthService(
    prisma,
    hashes as AuthHashService,
    tokens as AuthTokenService,
    passwords as PasswordHashService,
    rateLimits,
  );
  return { service, prisma, hashes, tokens, passwords, rateLimits, transaction };
}

const ACTIVE_USER = {
  id: 'user-1',
  passwordHash: 'argon2:hash',
  status: UserStatus.ACTIVE,
  lockedUntil: null,
  failedLoginCount: 0,
};

describe('StaffAuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestPasswordChallenge', () => {
    it('enforces password rate limits on the normalized identifier and the ip before issuing a challenge', async () => {
      const enforce = vi.fn(async () => undefined);
      const { service } = createService({ enforce, user: vi.fn(async () => ACTIVE_USER) });

      await service.requestPasswordChallenge({
        identifier: ' Staff@Example.com ',
        password: 'a-password',
        ipAddress: '192.0.2.10',
      });

      expect(enforce).toHaveBeenCalledTimes(2);
      expect(enforce).toHaveBeenCalledWith({
        dimension: 'staff-password:identifier',
        value: 'staff@example.com',
        context: 'identifier',
      });
      expect(enforce).toHaveBeenCalledWith({
        dimension: 'staff-password:ip',
        value: '192.0.2.10',
        context: 'ip',
      });
    });

    it('returns a TOTP challenge after validating an active user password', async () => {
      const tx = createTransaction();
      const { service, hashes, tokens, passwords } = createService({
        user: vi.fn(async () => ACTIVE_USER),
        transaction: tx,
        hashes: {
          hash: vi.fn((value: string) => `hash:${value}`),
          candidateHashes: vi.fn((value: string) => [`hash:${value}`]),
        },
        tokens: { generateMfaChallengeToken: vi.fn(() => 'challenge-token-1') },
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (value: string) => `argon2:${value}`),
        },
      });

      const result = await service.requestPasswordChallenge({
        identifier: ' Staff@Example.com ',
        password: 'a-super-secure-password',
        ipAddress: '192.0.2.10',
      });

      expect(passwords.verify).toHaveBeenCalledWith('argon2:hash', 'a-super-secure-password');
      expect(passwords.needsRehash).toHaveBeenCalledWith('argon2:hash');
      expect(tokens.generateMfaChallengeToken).toHaveBeenCalled();
      expect(hashes.hash).toHaveBeenCalledWith('challenge-token-1', 'mfa-challenge');
      expect(tx.mfaChallenge.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          purpose: MfaChallengePurpose.STAFF_SIGN_IN,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: expect.any(Date) },
      });
      expect(tx.mfaChallenge.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          challengeTokenHash: 'hash:challenge-token-1',
          purpose: MfaChallengePurpose.STAFF_SIGN_IN,
          expiresAt: expect.any(Date),
          requestId: 'no-request-id',
        },
      });
      expect(tx.loginAttempt.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          identifierHash: 'hash:staff@example.com',
          ipHash: 'hash:192.0.2.10',
          method: LoginMethod.PASSWORD,
          outcome: LoginAttemptOutcome.SUCCESS,
          requestId: 'no-request-id',
        },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          action: 'auth.staff.password_verified',
          entityType: 'User',
          entityId: 'user-1',
          requestId: 'no-request-id',
          metadata: { method: 'PASSWORD', next: 'TOTP' },
        },
      });
      expect(result).toEqual({
        data: { challengeToken: 'challenge-token-1', next: 'TOTP', expiresInSeconds: 300 },
      });
    });

    it('upgrades and persists a new argon2 password hash when the stored hash needs rehashing', async () => {
      const tx = createTransaction();
      const { service } = createService({
        user: vi.fn(async () => ACTIVE_USER),
        transaction: tx,
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => true),
          hash: vi.fn(async () => 'argon2:new-hash'),
        },
      });

      await service.requestPasswordChallenge({
        identifier: 'staff@example.com',
        password: 'a-new-strong-password-here',
      });

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'argon2:new-hash' },
      });
    });

    it('does not rehash when the stored hash is current', async () => {
      const tx = createTransaction();
      const { service } = createService({
        user: vi.fn(async () => ACTIVE_USER),
        transaction: tx,
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async () => 'argon2:new-hash'),
        },
      });

      await service.requestPasswordChallenge({ identifier: 'staff@example.com', password: 'a-valid-password' });

      expect(tx.user.update).not.toHaveBeenCalled();
    });

    it('throws and records a failure when the password does not match', async () => {
      const tx = createTransaction();
      const { service } = createService({
        user: vi.fn(async () => ACTIVE_USER),
        transaction: tx,
        passwords: { verify: vi.fn(async () => false) },
      });

      await expect(
        service.requestPasswordChallenge({ identifier: 'staff@example.com', password: 'wrong-password' }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ outcome: LoginAttemptOutcome.INVALID_CREDENTIALS }),
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'auth.staff.password_failed' }),
        }),
      );
    });

    it('throws and records a failure for an unknown user without revealing existence', async () => {
      const tx = createTransaction();
      const { service, passwords } = createService({
        user: vi.fn(async () => null),
        transaction: tx,
      });

      await expect(
        service.requestPasswordChallenge({ identifier: 'unknown@example.com', password: 'a-password' }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(passwords.verify).toHaveBeenCalledWith(undefined, 'a-password');
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: undefined }) }),
      );
    });

    it('locks the account after repeated failures', async () => {
      const tx = createTransaction({
        user: {
          findUnique: vi.fn(async () => ({ failedLoginCount: 4 })),
          update: vi.fn(async () => ({})),
        },
      });
      const { service } = createService({
        user: vi.fn(async () => ACTIVE_USER),
        transaction: tx,
        passwords: { verify: vi.fn(async () => false) },
      });

      await expect(
        service.requestPasswordChallenge({ identifier: 'staff@example.com', password: 'wrong' }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: ACTIVE_USER.id },
        data: expect.objectContaining({
          failedLoginCount: 5,
          lockedUntil: expect.any(Date),
        }),
      });
    });
  });

  describe('normalizeIdentifier', () => {
    it('throws for an empty or oversized identifier', async () => {
      const { service, passwords } = createService({
        passwords: { verify: vi.fn(async () => false) },
      });

      await expect(
        service.requestPasswordChallenge({ identifier: '   ', password: 'a-password' }),
      ).rejects.toBeInstanceOf(StaffAuthException);
      await expect(
        service.requestPasswordChallenge({ identifier: 'a'.repeat(321), password: 'a-password' }),
      ).rejects.toBeInstanceOf(StaffAuthException);
      expect(passwords.verify).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('updates the hash, revokes other session families, and audits the change', async () => {
      const tx = createTransaction();
      const verify = vi.fn()
        .mockResolvedValueOnce(true)   // currentPassword valid
        .mockResolvedValueOnce(false);  // newPassword != current
      const { service, passwords } = createService({
        transaction: tx,
        passwords: {
          verify,
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (v: string) => `argon2:${v}`),
          assertPolicy: vi.fn(() => {}),
        },
      });

      await service.changePassword({
        userId: 'user-1',
        currentPassword: 'current-password',
        newPassword: 'brand-new-secure-password',
        currentSessionId: 'session-current',
      });

      expect(passwords.assertPolicy).toHaveBeenCalledWith('brand-new-secure-password');
      expect(passwords.verify).toHaveBeenCalledWith('argon2:hash', 'current-password');
      expect(passwords.hash).toHaveBeenCalledWith('brand-new-secure-password');
      expect(tx.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ passwordHash: 'argon2:hash', status: UserStatus.ACTIVE }),
          data: expect.objectContaining({ passwordHash: 'argon2:brand-new-secure-password' }),
        }),
      );
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tokenFamilyId: { not: 'family-current' } }),
          data: expect.objectContaining({ revokeReason: 'PASSWORD_CHANGED' }),
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'auth.staff.password_changed',
          }),
        }),
      );
    });

    it('rejects when the current password is wrong', async () => {
      const tx = createTransaction();
      const { service } = createService({
        transaction: tx,
        passwords: {
          verify: vi.fn(async () => false),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (v: string) => `argon2:${v}`),
          assertPolicy: vi.fn(() => {}),
        },
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentPassword: 'wrong',
          newPassword: 'brand-new-secure-password',
          currentSessionId: 'session-current',
        }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.session.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the new password is identical to the current one', async () => {
      const tx = createTransaction();
      const { service } = createService({
        transaction: tx,
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (v: string) => `argon2:${v}`),
          assertPolicy: vi.fn(() => {}),
        },
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentPassword: 'same-password',
          newPassword: 'same-password',
          currentSessionId: 'session-current',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects policy failures before touching the database', async () => {
      const tx = createTransaction();
      const { service } = createService({
        transaction: tx,
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (v: string) => `argon2:${v}`),
          assertPolicy: vi.fn(() => { throw new PasswordPolicyError(); }),
        },
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentPassword: 'current',
          newPassword: 'short',
          currentSessionId: 'session-current',
        }),
      ).rejects.toThrow(PasswordPolicyError);

      expect(tx.user.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('rejects when the compare-and-set update fails (concurrent password change)', async () => {
      const tx = createTransaction({
        user: {
          findUnique: vi.fn(async () => ({ failedLoginCount: 0 })),
          findUniqueOrThrow: vi.fn(async () => ({ ...ACTIVE_USER })),
          update: vi.fn(async () => ({})),
          updateMany: vi.fn(async () => ({ count: 0 })),
        },
      });
      const { service } = createService({
        transaction: tx,
        passwords: {
          verify: vi.fn()
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce(false),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async (v: string) => `argon2:${v}`),
          assertPolicy: vi.fn(() => {}),
        },
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentPassword: 'current-password',
          newPassword: 'brand-new-secure-password',
          currentSessionId: 'session-current',
        }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(tx.session.updateMany).not.toHaveBeenCalled();
    });
  });
});