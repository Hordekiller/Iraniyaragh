import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginAttemptOutcome, LoginMethod, MfaChallengePurpose, Prisma, UserStatus } from '@prisma/client';
import type { StaffMfaChallengeResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuthHashService } from './auth-hash.service';
import { AuthTokenService } from './auth-token.service';
import {
  AUTH_SESSION_REVOKE_REASON,
  revokeOtherSessionFamilies,
} from './auth-session.service';
import { PasswordHashService } from './password-hash.service';
import { RateLimitService } from './rate-limit.service';

const MFA_CHALLENGE_TTL_MS = 5 * 60 * 1_000;
const PASSWORD_LOCK_THRESHOLD = 5;
const PASSWORD_LOCK_MS = 15 * 60 * 1_000;

export class StaffAuthException extends UnauthorizedException {
  constructor() {
    super({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Authentication could not be completed.' });
  }
}

export type StaffPasswordCommand = Readonly<{
  identifier: string;
  password: string;
  ipAddress?: string;
}>;

export type StaffPasswordChangeCommand = Readonly<{
  userId: string;
  currentPassword: string;
  newPassword: string;
  currentSessionId: string;
}>;

@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashes: AuthHashService,
    private readonly tokens: AuthTokenService,
    private readonly passwords: PasswordHashService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async requestPasswordChallenge(command: StaffPasswordCommand): Promise<StaffMfaChallengeResponse> {
    const identifier = this.normalizeIdentifier(command.identifier);
    const ipAddress = command.ipAddress?.trim() || 'unknown';

    await Promise.all([
      this.rateLimits.enforce({
        dimension: 'staff-password:identifier',
        value: identifier,
        context: 'identifier',
      }),
      this.rateLimits.enforce({
        dimension: 'staff-password:ip',
        value: ipAddress,
        context: 'ip',
      }),
    ]);

    const user = await this.prisma.user.findUnique({
      where: { email: identifier },
      select: {
        id: true,
        passwordHash: true,
        status: true,
        lockedUntil: true,
        failedLoginCount: true,
      },
    });
    const passwordMatches = await this.passwords.verify(user?.passwordHash, command.password);
    const now = new Date();
    const eligible =
      passwordMatches &&
      user?.status === UserStatus.ACTIVE &&
      (user.lockedUntil === null || user.lockedUntil === undefined || user.lockedUntil <= now);

    if (!eligible) {
      await this.recordFailure({ userId: user?.id, identifier, ipAddress, lockedUntil: user?.lockedUntil });
      throw new StaffAuthException();
    }

    const challengeToken = this.tokens.generateMfaChallengeToken();
    const challengeTokenHash = this.hashes.hash(challengeToken, 'mfa-challenge');
    const requestId = getRequestId();
    const expiresAt = new Date(now.getTime() + MFA_CHALLENGE_TTL_MS);
    const upgradedPasswordHash = user.passwordHash && this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(command.password)
      : undefined;

    await this.prisma.$transaction(
      async tx => {
        if (upgradedPasswordHash) {
          await tx.user.update({ where: { id: user.id }, data: { passwordHash: upgradedPasswordHash } });
        }
        await tx.mfaChallenge.updateMany({
          where: {
            userId: user.id,
            purpose: MfaChallengePurpose.STAFF_SIGN_IN,
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        });
        await tx.mfaChallenge.create({
          data: {
            userId: user.id,
            challengeTokenHash,
            purpose: MfaChallengePurpose.STAFF_SIGN_IN,
            expiresAt,
            requestId,
          },
        });
        await tx.loginAttempt.create({
          data: {
            userId: user.id,
            identifierHash: this.hashes.hash(identifier, 'identifier'),
            ipHash: this.hashes.hash(ipAddress, 'ip'),
            method: LoginMethod.PASSWORD,
            outcome: LoginAttemptOutcome.SUCCESS,
            requestId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: 'auth.staff.password_verified',
            entityType: 'User',
            entityId: user.id,
            requestId,
            metadata: { method: 'PASSWORD', next: 'TOTP' },
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return {
      data: {
        challengeToken,
        next: 'TOTP',
        expiresInSeconds: 300,
      },
    };
  }

  private async recordFailure(input: {
    userId?: string;
    identifier: string;
    ipAddress: string;
    lockedUntil?: Date | null;
  }): Promise<void> {
    const requestId = getRequestId();
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      let lockedUntil = input.lockedUntil ?? null;
      if (input.userId) {
        const user = await tx.user.findUnique({ where: { id: input.userId }, select: { failedLoginCount: true } });
        const failedLoginCount = (user?.failedLoginCount ?? 0) + 1;
        if (failedLoginCount >= PASSWORD_LOCK_THRESHOLD) {
          lockedUntil = new Date(now.getTime() + PASSWORD_LOCK_MS);
        }
        await tx.user.update({
          where: { id: input.userId },
          data: { failedLoginCount, lockedUntil },
        });
      }
      await tx.loginAttempt.create({
        data: {
          userId: input.userId,
          identifierHash: this.hashes.hash(input.identifier, 'identifier'),
          ipHash: this.hashes.hash(input.ipAddress, 'ip'),
          method: LoginMethod.PASSWORD,
          outcome: LoginAttemptOutcome.INVALID_CREDENTIALS,
          requestId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId ?? null,
          action: 'auth.staff.password_failed',
          entityType: 'User',
          entityId: input.userId ?? null,
          requestId,
          metadata: { method: 'PASSWORD', outcome: 'INVALID_CREDENTIALS' },
        },
      });
    });
  }

  async changePassword(command: StaffPasswordChangeCommand): Promise<void> {
    this.passwords.assertPolicy(command.newPassword);
    const requestId = getRequestId();

    await this.prisma.$transaction(async tx => {
      const user = await tx.user.findUniqueOrThrow({
        where: { id: command.userId },
        select: { id: true, passwordHash: true, status: true },
      });
      if (user.status !== UserStatus.ACTIVE) throw new StaffAuthException();

      // Constant-work failure path: the current password is always verified with
      // Argon2 before any error is raised, so a rejected attempt takes the same
      // time as a successful one (guessing the current password stays hard).
      const currentPasswordIsValid = await this.passwords.verify(user.passwordHash, command.currentPassword);
      const matchesCurrent = currentPasswordIsValid
        ? await this.passwords.verify(user.passwordHash, command.newPassword)
        : false;
      if (!currentPasswordIsValid) throw new StaffAuthException();
      if (matchesCurrent) {
        throw new BadRequestException({
          code: 'AUTH_PASSWORD_UNCHANGED',
          message: 'The new password must differ from the current password.',
        });
      }

      const newPasswordHash = await this.passwords.hash(command.newPassword);
      const updated = await tx.user.updateMany({
        where: { id: command.userId, passwordHash: user.passwordHash, status: UserStatus.ACTIVE },
        data: { passwordHash: newPasswordHash, passwordChangedAt: new Date() },
      });
      // Compare-and-set failed (another change landed first): reject so a stale
      // "current password" cannot be replayed against the new hash.
      if (updated.count !== 1) throw new StaffAuthException();

      await revokeOtherSessionFamilies(tx, {
        userId: command.userId,
        currentSessionId: command.currentSessionId,
        reason: AUTH_SESSION_REVOKE_REASON.passwordChanged,
        actorId: command.userId,
      });

      await tx.auditLog.create({
        data: {
          actorId: command.userId,
          action: 'auth.staff.password_changed',
          entityType: 'User',
          entityId: command.userId,
          requestId,
          metadata: { otherSessionFamiliesRevoked: true },
        },
      });
    });
  }

  private normalizeIdentifier(identifier: string): string {
    const normalized = identifier.trim().toLowerCase();
    if (normalized.length === 0 || normalized.length > 320) throw new StaffAuthException();
    return normalized;
  }
}
