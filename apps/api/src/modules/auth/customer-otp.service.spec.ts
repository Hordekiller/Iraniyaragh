import { BadRequestException } from '@nestjs/common';
import { LoginAttemptOutcome, OtpChannel, OtpPurpose, UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHashService } from './auth-hash.service';
import { CustomerOtpService, OTP_REQUEST_IP_FALLBACK } from './customer-otp.service';
import type { RateLimitService } from './rate-limit.service';
import type { PrismaService } from '../../database/prisma.service';
import { FakeSmsProvider } from '../notifications/fake-sms.provider';
import type { SmsProvider, SmsSendResult } from '../notifications/sms-provider';

type MockTx = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  otpCode: {
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  loginAttempt: {
    create: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

function createTx(overrides: Partial<MockTx> = {}): MockTx {
  return {
    user: overrides.user ?? {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async () => ({ id: 'user-1' })),
      update: vi.fn(async () => ({})),
    },
    otpCode: overrides.otpCode ?? {
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
      create: vi.fn(async () => ({ id: 'challenge-1' })),
      findUnique: vi.fn(async () => null),
    },
    loginAttempt: overrides.loginAttempt ?? { create: vi.fn(async () => ({})) },
    auditLog: overrides.auditLog ?? { create: vi.fn(async () => ({})) },
  };
}

function createService(
  overrides: {
    tx?: MockTx;
    hashes?: Pick<AuthHashService, 'hash' | 'verify'>;
    enforce?: ReturnType<typeof vi.fn>;
    reset?: ReturnType<typeof vi.fn>;
    challenge?: unknown | null;
    smsResult?: SmsSendResult;
    smsProvider?: SmsProvider;
  } = {},
) {
  const tx = overrides.tx ?? createTx();
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(tx)),
    auditLog: tx.auditLog,
  } as unknown as PrismaService;
  const hashes = overrides.hashes ?? {
    hash: vi.fn((value: string) => `hash:${value}`),
    verify: vi.fn(() => true),
  };
  const limits = {
    enforce: overrides.enforce ?? vi.fn(async () => undefined),
    reset: overrides.reset ?? vi.fn(async () => undefined),
  } as unknown as RateLimitService;

  const smsProvider = overrides.smsProvider ?? new FakeSmsProvider(overrides.smsResult);
  const service = new CustomerOtpService(prisma, hashes as AuthHashService, limits as RateLimitService, smsProvider, {
    templateId: 42,
    codeParameterName: 'Code',
  });
  return { service, prisma, hashes, limits, tx, smsProvider };
}

const CHALLENGE = {
  id: 'challenge-1',
  destinationHash: 'hash:mobile',
  codeHash: 'hash:123456',
  purpose: OtpPurpose.SIGN_IN,
  channel: OtpChannel.SMS,
  consumedAt: null,
  invalidatedAt: null,
  attempts: 0,
  maxAttempts: 5,
  expiresAt: new Date(Date.now() + 120_000),
  user: {
    id: 'user-1',
    mobile: '+989123456789',
    status: UserStatus.PENDING,
    lockedUntil: null,
  },
};

const ACTIVE_CHALLENGE = {
  ...CHALLENGE,
  user: {
    id: 'user-1',
    mobile: '+989123456789',
    status: UserStatus.ACTIVE,
    lockedUntil: null,
  },
};

describe('CustomerOtpService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('requestOtp', () => {
    it('rejects an unsupported mobile shape', async () => {
      const { service } = createService();
      await expect(
        service.requestOtp({ mobile: 'not-a-mobile', client: 'CUSTOMER_WEB' }, '192.0.2.1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces request windows and issues a challenge for a valid mobile', async () => {
      const tx = createTx();
      const enforce = vi.fn(async () => undefined);
      const { service } = createService({ tx, enforce });
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      tx.otpCode.create = vi.fn(async () => ({ id: 'challenge-1' }));

      const result = await service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, '192.0.2.1');

      expect(result).toEqual({
        challengeId: 'challenge-1',
        expiresInSeconds: 300,
        resendAfterSeconds: 60,
      });
      expect(enforce).toHaveBeenCalledTimes(5);
      expect(tx.otpCode.updateMany).toHaveBeenCalledWith({
        where: {
          destinationHash: 'hash:+989123456789',
          purpose: OtpPurpose.SIGN_IN,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: expect.any(Date) },
      });
      expect(tx.otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            codeHash: expect.stringMatching(/^hash:\d{6}$/u),
            purpose: OtpPurpose.SIGN_IN,
            channel: OtpChannel.SMS,
            maxAttempts: 5,
          }),
        }),
      );
    });

    it('dispatches exactly once after challenge persistence through the provider port', async () => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      const send = vi.fn(async () => ({ status: 'accepted', providerMessageId: 'message-1' }) as const);
      const { service } = createService({ tx, smsProvider: { send } });

      await service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, '192.0.2.1');

      expect(send).toHaveBeenCalledOnce();
      expect(send).toHaveBeenCalledWith({
        purpose: 'customer_login',
        destination: '+989123456789',
        templateId: 42,
        parameters: { Code: expect.stringMatching(/^\d{6}$/u) },
        correlationId: 'challenge-1',
      });
      expect(tx.otpCode.create.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]);
    });

    it('does not dispatch when validation fails', async () => {
      const send = vi.fn();
      const { service } = createService({ smsProvider: { send } });

      await expect(service.requestOtp({ mobile: 'invalid', client: 'CUSTOMER_WEB' }, undefined)).rejects.toBeDefined();
      expect(send).not.toHaveBeenCalled();
    });

    it('keeps an unknown-result challenge usable and never retries', async () => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      const send = vi.fn(async () => ({ status: 'unknown_result' }) as const);
      const { service } = createService({ tx, smsProvider: { send } });

      await expect(
        service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, '192.0.2.1'),
      ).resolves.toMatchObject({ challengeId: 'challenge-1' });
      expect(send).toHaveBeenCalledOnce();
      expect(tx.otpCode.updateMany).toHaveBeenCalledTimes(1);
    });

    it.each([
      { status: 'rejected', reason: 'template' } as const,
      { status: 'rate_limited' } as const,
      { status: 'unavailable' } as const,
    ])('invalidates the fresh challenge after known delivery failure $status', async smsResult => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      const { service } = createService({ tx, smsResult });

      await expect(
        service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, '192.0.2.1'),
      ).rejects.toMatchObject({ status: 503 });
      expect(tx.otpCode.updateMany).toHaveBeenLastCalledWith({
        where: {
          id: 'challenge-1',
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: expect.any(Date) },
      });
    });

    it('treats a provider throw as ambiguous without retry or invalidation', async () => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      const send = vi.fn(async () => {
        throw new Error('unsafe vendor detail');
      });
      const { service } = createService({ tx, smsProvider: { send } });

      await expect(
        service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, '192.0.2.1'),
      ).resolves.toMatchObject({ challengeId: 'challenge-1' });
      expect(send).toHaveBeenCalledOnce();
      expect(tx.otpCode.updateMany).toHaveBeenCalledTimes(1);
    });

    it('creates a PENDING user when the destination has no profile', async () => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => null);
      tx.user.create = vi.fn(async () => ({ id: 'user-new' }));
      tx.otpCode.create = vi.fn(async () => ({ id: 'challenge-1' }));
      const { service } = createService({ tx });

      await service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, undefined);

      expect(tx.user.create).toHaveBeenCalledWith({
        data: { mobile: '+989123456789', status: UserStatus.PENDING },
        select: { id: true },
      });
    });

    it('falls back to 0.0.0.0 when no ip is provided', async () => {
      const tx = createTx();
      tx.user.findUnique = vi.fn(async () => ({ id: 'user-1' }));
      tx.otpCode.create = vi.fn(async () => ({ id: 'challenge-1' }));
      const { service, hashes } = createService({ tx });

      await service.requestOtp({ mobile: '+989123456789', client: 'CUSTOMER_WEB' }, undefined);

      expect(hashes.hash).toHaveBeenCalledWith(OTP_REQUEST_IP_FALLBACK, 'ip');
    });
  });

  describe('verifyOtp', () => {
    it('consumes a valid challenge and succeeds', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => ACTIVE_CHALLENGE);
      tx.otpCode.update = vi.fn(async () => ({}));
      tx.otpCode.updateMany = vi.fn(async () => ({ count: 1 }));
      const { service } = createService({ tx, challenge: ACTIVE_CHALLENGE });
      const result = await service.verifyOtp({ challengeId: 'challenge-1', code: '123456' }, '192.0.2.1');
      expect(result.challenge).toEqual({
        kind: 'success',
        userId: 'user-1',
        deviceName: undefined,
      });
      expect(tx.user.update).toHaveBeenCalled();
    });

    it('activates a previously PENDING user and sets verified flags', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => CHALLENGE);
      tx.otpCode.update = vi.fn(async () => ({}));
      const { service } = createService({ tx, challenge: CHALLENGE });

      await service.verifyOtp({ challengeId: 'challenge-1', code: '123456' }, '192.0.2.1');

      expect(tx.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
        data: { consumedAt: expect.any(Date) },
      });
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          status: UserStatus.ACTIVE,
          isMobileVerified: true,
          mobileVerifiedAt: expect.any(Date),
          lastLoginAt: expect.any(Date),
        },
      });
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: LoginAttemptOutcome.SUCCESS,
          }),
        }),
      );
    });

    it('returns invalid for a missing or consumed challenge', async () => {
      const { service } = createService();
      const result = await service.verifyOtp({ challengeId: 'nope', code: '123456' }, '192.0.2.1');
      expect(result.challenge.kind).toBe('invalid');
    });

    it('returns expired for an expired challenge', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => ({
        ...CHALLENGE,
        expiresAt: new Date(Date.now() - 1000),
      }));
      const { service } = createService({
        tx,
        challenge: { ...CHALLENGE, expiresAt: new Date(Date.now() - 1000) },
      });

      const result = await service.verifyOtp({ challengeId: 'challenge-1', code: '123456' }, '192.0.2.1');
      expect(result.challenge.kind).toBe('expired');
    });

    it('rejects a wrong code, increments attempts and records a failure', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => ACTIVE_CHALLENGE);
      const { service } = createService({
        tx,
        challenge: ACTIVE_CHALLENGE,
        hashes: {
          hash: vi.fn((value: string) => `hash:${value}`),
          verify: vi.fn(() => false),
        },
      });

      const result = await service.verifyOtp({ challengeId: 'challenge-1', code: '000000' }, '192.0.2.1');
      expect(result.challenge.kind).toBe('invalid');
      expect(tx.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
        data: { attempts: { increment: 1 } },
      });
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: LoginAttemptOutcome.INVALID_CODE,
          }),
        }),
      );
    });

    it('invalidates the challenge after the last allowed attempt', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => ({
        ...ACTIVE_CHALLENGE,
        attempts: 4,
      }));
      const { service } = createService({
        tx,
        challenge: { ...ACTIVE_CHALLENGE, attempts: 4 },
        hashes: {
          hash: vi.fn((value: string) => `hash:${value}`),
          verify: vi.fn(() => false),
        },
      });

      await service.verifyOtp({ challengeId: 'challenge-1', code: '000000' }, '192.0.2.1');
      expect(tx.otpCode.update).toHaveBeenCalledWith({
        where: { id: 'challenge-1' },
        data: { attempts: { increment: 1 }, invalidatedAt: expect.any(Date) },
      });
    });

    it('rejects an ineligible (suspended) user challenge', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => ({
        ...CHALLENGE,
        user: {
          id: 'user-1',
          mobile: '+989123456789',
          status: UserStatus.SUSPENDED,
          lockedUntil: null,
        },
      }));
      const { service } = createService({
        tx,
        challenge: {
          ...CHALLENGE,
          user: {
            id: 'user-1',
            mobile: '+989123456789',
            status: UserStatus.SUSPENDED,
            lockedUntil: null,
          },
        },
      });

      const result = await service.verifyOtp({ challengeId: 'challenge-1', code: '123456' }, '192.0.2.1');
      expect(result.challenge.kind).toBe('invalid');
      expect(tx.loginAttempt.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: LoginAttemptOutcome.ACCOUNT_SUSPENDED,
          }),
        }),
      );
    });

    it('enforces the per-ip failure window on failed verification', async () => {
      const tx = createTx();
      tx.otpCode.findUnique = vi.fn(async () => null);
      const enforce = vi.fn(async () => undefined);
      const { service } = createService({ tx, enforce });

      const result = await service.verifyOtp({ challengeId: 'challenge-1', code: '999999' }, '192.0.2.1');
      expect(result.challenge.kind).toBe('invalid');
      expect(enforce).toHaveBeenCalledWith({
        dimension: 'otp-verify:ip-fail-hour',
        value: '192.0.2.1',
        context: 'ip',
      });
    });
  });

  describe('resetIpVerificationFailures', () => {
    it('resets the per-ip failure window', async () => {
      const reset = vi.fn(async () => undefined);
      const { service } = createService({ reset });
      await service.resetIpVerificationFailures('192.0.2.1');
      expect(reset).toHaveBeenCalledWith({
        dimension: 'otp-verify:ip-fail-hour',
        value: '192.0.2.1',
        context: 'ip',
      });
    });
  });
});
