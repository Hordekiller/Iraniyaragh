import { LoginAttemptOutcome, LoginMethod, MfaChallengePurpose, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHashService } from './auth-hash.service';
import type { AuthSessionService } from './auth-session.service';
import type { AuthTokenService } from './auth-token.service';
import type { PasswordHashService } from './password-hash.service';
import type { RateLimitService } from './rate-limit.service';
import { StaffAuthException, StaffAuthService } from './staff-auth.service';
import { PasswordPolicyError } from './password-hash.service';
import type { PrismaService } from '../../database/prisma.service';

type MockTransaction = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
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
      update: vi.fn(async () => ({})),
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
  rotateSessionAfterCredentialChange?: ReturnType<typeof vi.fn>;
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
  };
  const rateLimits = {
    enforce: overrides.enforce ?? vi.fn(async () => undefined),
  } as unknown as RateLimitService;
  const sessions = {
    rotateSessionAfterCredentialChange:
      overrides.rotateSessionAfterCredentialChange ?? vi.fn(async () => Object.freeze({ sessionId: 'rotated-1' })),
  } as unknown as AuthSessionService;

  const service = new StaffAuthService(
    prisma,
    hashes as AuthHashService,
    tokens as AuthTokenService,
    passwords as PasswordHashService,
    rateLimits,
    sessions,
  );
  return { service, prisma, hashes, tokens, passwords, rateLimits, transaction, sessions };
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
    it('verifies the current password and delegates the atomic credential rotation to the session service', async () => {
      const rotateSessionAfterCredentialChange = vi.fn(async () =>
        Object.freeze({ sessionId: 'rotated-1', accessToken: 'at', refreshToken: 'rt', csrfToken: 'ct', expiresAt: new Date(), tokenFamilyId: 'family-1' }),
      );
      const { service, passwords, sessions } = createService({
        user: vi.fn(async () => ({ id: 'user-1', passwordHash: 'argon2:stored', status: UserStatus.ACTIVE })),
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async () => 'argon2:new-hash'),
        },
        rotateSessionAfterCredentialChange,
      });

      await service.changePassword({
        userId: 'user-1',
        currentSessionId: 'session-current',
        currentPassword: 'the-current-password',
        newPassword: 'a-new-strong-password',
      });

      expect(passwords.verify).toHaveBeenCalledWith('argon2:stored', 'the-current-password');
      expect(passwords.hash).toHaveBeenCalledWith('a-new-strong-password');
      expect(rotateSessionAfterCredentialChange).toHaveBeenCalledWith({
        userId: 'user-1',
        currentSessionId: 'session-current',
        passwordHash: 'argon2:new-hash',
        passwordChangedAt: expect.any(Date),
      });
      expect(sessions.rotateSessionAfterCredentialChange).toHaveBeenCalled();
    });

    it('rejects a wrong current password without touching the credential rotation', async () => {
      const rotateSessionAfterCredentialChange = vi.fn();
      const { service, passwords } = createService({
        user: vi.fn(async () => ({ id: 'user-1', passwordHash: 'argon2:stored', status: UserStatus.ACTIVE })),
        passwords: { verify: vi.fn(async () => false) },
        rotateSessionAfterCredentialChange,
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentSessionId: 'session-current',
          currentPassword: 'wrong-current-password',
          newPassword: 'a-new-strong-password',
        }),
      ).rejects.toBeInstanceOf(StaffAuthException);

      expect(passwords.verify).toHaveBeenCalled();
      expect(rotateSessionAfterCredentialChange).not.toHaveBeenCalled();
    });

    it('rejects a new password that violates the policy with the stable AUTH_PASSWORD_POLICY envelope', async () => {
      const { service } = createService({
        user: vi.fn(async () => ({ id: 'user-1', passwordHash: 'argon2:stored', status: UserStatus.ACTIVE })),
        passwords: {
          verify: vi.fn(async () => true),
          needsRehash: vi.fn(() => false),
          hash: vi.fn(async () => {
            throw new PasswordPolicyError();
          }),
        },
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentSessionId: 'session-current',
          currentPassword: 'the-current-password',
          newPassword: 'too-short',
        }),
      ).rejects.toMatchObject({ response: { code: 'AUTH_PASSWORD_POLICY' }, status: 400 });
    });

    it('rejects an inactive or missing user with the generic authentication failure', async () => {
      const rotateSessionAfterCredentialChange = vi.fn();
      const { service } = createService({
        user: vi.fn(async () => ({ id: 'user-1', passwordHash: 'argon2:stored', status: UserStatus.SUSPENDED })),
        rotateSessionAfterCredentialChange,
      });

      await expect(
        service.changePassword({
          userId: 'user-1',
          currentSessionId: 'session-current',
          currentPassword: 'the-current-password',
          newPassword: 'a-new-strong-password',
        }),
      ).rejects.toBeInstanceOf(StaffAuthException);
      expect(rotateSessionAfterCredentialChange).not.toHaveBeenCalled();
    });
  });
});