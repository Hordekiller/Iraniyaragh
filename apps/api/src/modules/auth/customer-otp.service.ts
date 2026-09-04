import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { LoginAttemptOutcome, LoginMethod, OtpChannel, OtpPurpose, Prisma, UserStatus } from '@prisma/client';
import type { CustomerOtpRequest, CustomerOtpVerifyRequest } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuthHashService } from './auth-hash.service';
import { normalizeIranianMobile } from './mobile';
import { RateLimitService } from './rate-limit.service';

export const OTP_TTL_SECONDS = 300;
export const OTP_RESEND_AFTER_SECONDS = 60;
export const OTP_ATTEMPTS_LIMIT = 5;
export const OTP_REQUEST_IP_FALLBACK = '0.0.0.0';

const MAX_SERIALIZABLE_ATTEMPTS = 5;

export type OtpIssueResult = Readonly<{
  challengeId: string;
  expiresInSeconds: typeof OTP_TTL_SECONDS;
  resendAfterSeconds: typeof OTP_RESEND_AFTER_SECONDS;
}>;

export type OtpChallengeResult =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'success'; userId: string; deviceName?: string };

export type OtpVerifyResult = Readonly<{
  challenge: OtpChallengeResult;
}>;

class OtpConsumeRaceError extends Error {
  constructor() {
    super('OTP consume compare-and-swap lost.');
    this.name = 'OtpConsumeRaceError';
  }
}

@Injectable()
export class CustomerOtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashes: AuthHashService,
    private readonly limits: RateLimitService,
  ) {}

  async requestOtp(body: CustomerOtpRequest, ip: string | undefined): Promise<OtpIssueResult> {
    const normalized = normalizeIranianMobile(body.mobile);
    if (!normalized) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Mobile must be a supported Iranian mobile number.',
      });
    }
    const mobile = normalized.value;
    const safeIp = this.safeIp(ip);

    // AUTH_CONTRACT §9 — request windows are consumed before any persistence
    // read so absent and existing destinations exercise comparable work.
    await this.limits.enforce({ dimension: 'otp-request:destination', value: mobile, context: 'identifier' });
    await this.limits.enforce({ dimension: 'otp-request:destination-15m', value: mobile, context: 'identifier' });
    await this.limits.enforce({ dimension: 'otp-request:destination-24h', value: mobile, context: 'identifier' });
    await this.limits.enforce({ dimension: 'otp-request:ip-hour', value: safeIp, context: 'ip' });
    await this.limits.enforce({ dimension: 'otp-request:ip-24h', value: safeIp, context: 'ip' });

    const challengeId = await this.issueActiveChallenge(mobile, safeIp);
    return Object.freeze({
      challengeId,
      expiresInSeconds: OTP_TTL_SECONDS,
      resendAfterSeconds: OTP_RESEND_AFTER_SECONDS,
    });
  }

  async verifyOtp(body: CustomerOtpVerifyRequest, ip: string | undefined): Promise<OtpVerifyResult> {
    const safeIp = this.safeIp(ip);
    const challenge = await this.consumeChallenge(body.challengeId, body.code, body.deviceName, safeIp);

    if (challenge.kind === 'success') {
      return { challenge };
    }

    // Failed verifications consume the per-IP failure window (AUTH_CONTRACT §9).
    // Exceeding it surfaces a real 429 RATE_LIMITED with Retry-After; it is
    // intentionally not folded into the challenge result.
    await this.limits.enforce({ dimension: 'otp-verify:ip-fail-hour', value: safeIp, context: 'ip' });
    return { challenge };
  }

  async resetIpVerificationFailures(ip: string | undefined): Promise<void> {
    await this.limits.reset({ dimension: 'otp-verify:ip-fail-hour', value: this.safeIp(ip), context: 'ip' });
  }

  private async issueActiveChallenge(mobile: string, safeIp: string): Promise<string> {
    const requestId = getRequestId();
    const code = this.generateCode();
    const codeHash = this.hashes.hash(code, 'otp');
    const destinationHash = this.hashes.hash(mobile, 'identifier');
    const ipHash = this.hashes.hash(safeIp, 'ip');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1_000);

    return this.runSerializable(async tx => {
      const user = await this.resolvePrincipal(tx, mobile);
      if (!user) throw new OtpConsumeRaceError();

      await tx.otpCode.updateMany({
        where: { destinationHash, purpose: OtpPurpose.SIGN_IN, consumedAt: null, invalidatedAt: null },
        data: { invalidatedAt: now },
      });

      const created = await tx.otpCode.create({
        data: {
          userId: user.id,
          destinationHash,
          codeHash,
          purpose: OtpPurpose.SIGN_IN,
          channel: OtpChannel.SMS,
          maxAttempts: OTP_ATTEMPTS_LIMIT,
          expiresAt,
          requestedIpHash: ipHash,
          requestId,
        },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.otp.requested',
          entityType: 'User',
          entityId: user.id,
          requestId,
          metadata: {
            purpose: OtpPurpose.SIGN_IN,
            channel: OtpChannel.SMS,
            method: 'RESEND_INVALIDATES_PRIOR' as const,
          },
        },
      });

      return created.id;
    });
  }

  private async consumeChallenge(
    challengeId: string,
    code: string,
    deviceName: string | undefined,
    safeIp: string,
  ): Promise<OtpChallengeResult> {
    const requestId = getRequestId();
    const now = new Date();

    return this.runSerializable(async tx => {
      const challenge = await tx.otpCode.findUnique({
        where: { id: challengeId },
        include: { user: { select: { id: true, mobile: true, status: true, lockedUntil: true } } },
      });

      if (
        !challenge ||
        challenge.consumedAt !== null ||
        challenge.invalidatedAt !== null ||
        challenge.purpose !== OtpPurpose.SIGN_IN ||
        challenge.channel !== OtpChannel.SMS ||
        !challenge.user ||
        challenge.user.mobile === null
      ) {
        return { kind: 'invalid' } as const;
      }
      if (challenge.expiresAt <= now) {
        return { kind: 'expired' } as const;
      }
      if (challenge.attempts >= challenge.maxAttempts) {
        await tx.otpCode.update({
          where: { id: challenge.id },
          data: { invalidatedAt: now },
        });
        return { kind: 'invalid' } as const;
      }

      const codeMatches = this.hashes.verify(code, challenge.codeHash, 'otp');
      if (!codeMatches) {
        const attemptsAfterFailure = challenge.attempts + 1;
        await tx.otpCode.update({
          where: { id: challenge.id },
          data:
            attemptsAfterFailure >= challenge.maxAttempts
              ? { attempts: { increment: 1 }, invalidatedAt: now }
              : { attempts: { increment: 1 } },
        });
        await tx.loginAttempt.create({
          data: {
            userId: challenge.user.id,
            identifierHash: challenge.destinationHash,
            ipHash: this.hashes.hash(safeIp, 'ip'),
            method: LoginMethod.OTP,
            outcome: LoginAttemptOutcome.INVALID_CODE,
            requestId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: challenge.user.id,
            action: 'auth.otp.failed',
            entityType: 'OtpCode',
            entityId: challenge.id,
            requestId,
            metadata: { outcome: LoginAttemptOutcome.INVALID_CODE },
          },
        });
        return { kind: 'invalid' } as const;
      }

      const ineligibleOutcome = this.ineligibleOutcome(challenge.user.status, challenge.user.lockedUntil, now);
      if (ineligibleOutcome) {
        await tx.otpCode.update({
          where: { id: challenge.id },
          data: { invalidatedAt: now },
        });
        await tx.loginAttempt.create({
          data: {
            userId: challenge.user.id,
            identifierHash: challenge.destinationHash,
            ipHash: this.hashes.hash(safeIp, 'ip'),
            method: LoginMethod.OTP,
            outcome: ineligibleOutcome,
            requestId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: challenge.user.id,
            action: 'auth.otp.failed',
            entityType: 'OtpCode',
            entityId: challenge.id,
            requestId,
            metadata: { outcome: ineligibleOutcome },
          },
        });
        return { kind: 'invalid' } as const;
      }

      await tx.otpCode.update({
        where: { id: challenge.id },
        data: { consumedAt: now },
      });

      const userWasPending = challenge.user.status === UserStatus.PENDING;
      await tx.user.update({
        where: { id: challenge.user.id },
        data: userWasPending
          ? {
              status: UserStatus.ACTIVE,
              isMobileVerified: true,
              mobileVerifiedAt: now,
              lastLoginAt: now,
            }
          : { lastLoginAt: now },
      });

      await tx.loginAttempt.create({
        data: {
          userId: challenge.user.id,
          identifierHash: challenge.destinationHash,
          ipHash: this.hashes.hash(safeIp, 'ip'),
          method: LoginMethod.OTP,
          outcome: LoginAttemptOutcome.SUCCESS,
          requestId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: challenge.user.id,
          action: 'auth.otp.verified',
          entityType: 'User',
          entityId: challenge.user.id,
          requestId,
          metadata: { outcome: LoginAttemptOutcome.SUCCESS },
        },
      });

      return { kind: 'success', userId: challenge.user.id, deviceName } as const;
    });
  }

  private ineligibleOutcome(
    status: UserStatus,
    lockedUntil: Date | null,
    now: Date,
  ): LoginAttemptOutcome | undefined {
    if (lockedUntil !== null && lockedUntil > now) return LoginAttemptOutcome.ACCOUNT_LOCKED;
    if (status === UserStatus.SUSPENDED) return LoginAttemptOutcome.ACCOUNT_SUSPENDED;
    if (status === UserStatus.LOCKED) return LoginAttemptOutcome.ACCOUNT_LOCKED;
    if (status === UserStatus.DELETED) return LoginAttemptOutcome.ACCOUNT_DELETED;
    return undefined;
  }

  private async resolvePrincipal(tx: Prisma.TransactionClient, mobile: string) {
    const existing = await tx.user.findUnique({ where: { mobile }, select: { id: true } });
    if (existing) return existing;

    try {
      return await tx.user.create({
        data: { mobile, status: UserStatus.PENDING },
        select: { id: true },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return tx.user.findUnique({ where: { mobile }, select: { id: true } });
      }
      throw error;
    }
  }

  private generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private safeIp(ip: string | undefined): string {
    return typeof ip === 'string' && ip.trim() !== '' ? ip : OTP_REQUEST_IP_FALLBACK;
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
  }

  private async runSerializable<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (attempt === MAX_SERIALIZABLE_ATTEMPTS || !this.isRetryableTransactionError(error)) throw error;
      }
    }
    throw new Error('Unreachable serializable transaction state.');
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof OtpConsumeRaceError ||
      (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034')
    );
  }
}