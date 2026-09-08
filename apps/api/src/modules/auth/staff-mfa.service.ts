import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginAttemptOutcome, LoginMethod, MfaChallengePurpose, Prisma, UserStatus } from '@prisma/client';
import type { AccessTokenResponse, StaffRecoveryCodesResponse, StaffTotpEnrollmentResponse } from '@iranyaragh/contracts';
import { generateSecret, generateURI, verify } from 'otplib';
import { randomBytes } from 'node:crypto';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuthHashService } from './auth-hash.service';
import { AuthPrincipalService } from './auth-principal.service';
import { AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { RateLimitService } from './rate-limit.service';
import { TotpCryptoService } from './totp-crypto.service';

const MFA_MAX_ATTEMPTS = 5;

export class StaffMfaException extends UnauthorizedException {
  constructor() {
    super({ code: 'AUTH_CHALLENGE_INVALID', message: 'The authentication challenge is invalid.' });
  }
}

export type StaffTotpCommand = Readonly<{
  challengeToken: string;
  code: string;
  ipAddress?: string;
  deviceName?: string;
  userAgent?: string;
}>;

export type StaffRecoveryCommand = Readonly<{
  challengeToken: string;
  code: string;
  ipAddress?: string;
  deviceName?: string;
  userAgent?: string;
}>;

export type StaffMfaResult = Readonly<{
  response: AccessTokenResponse;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
}>;

@Injectable()
export class StaffMfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashes: AuthHashService,
    private readonly tokens: AuthTokenService,
    private readonly sessions: AuthSessionService,
    private readonly principals: AuthPrincipalService,
    private readonly limits: RateLimitService,
    private readonly crypto: TotpCryptoService,
  ) {}

  async beginTotpEnrollment(userId: string): Promise<StaffTotpEnrollmentResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
    if (!user) throw new StaffMfaException();
    const existing = await this.prisma.totpCredential.findUnique({ where: { userId }, select: { confirmedAt: true, disabledAt: true } });
    if (existing?.confirmedAt && !existing.disabledAt) throw new ConflictException({ code: 'CONFLICT', message: 'TOTP is already enrolled.' });
    const secret = generateSecret();
    const encrypted = this.crypto.encrypt(secret);
    const now = new Date();
    await this.prisma.$transaction(async tx => {
      await tx.totpCredential.upsert({
        where: { userId },
        create: { userId, encryptedSecret: encrypted.encryptedSecret, encryptionKeyVersion: encrypted.encryptionKeyVersion, createdAt: new Date(now.getTime() - 1_000) },
        update: { encryptedSecret: encrypted.encryptedSecret, encryptionKeyVersion: encrypted.encryptionKeyVersion, confirmedAt: null, disabledAt: null, lastAcceptedStep: null, updatedAt: now },
      });
      await tx.auditLog.create({ data: { actorId: userId, action: 'auth.totp.enrolled', entityType: 'User', entityId: userId, requestId: getRequestId(), metadata: { state: 'PENDING' } } });
    });
    return { data: { secret, provisioningUri: generateURI({ issuer: 'Iraniyaragh', label: user.email ?? user.id, secret }), expiresInSeconds: 300 } };
  }

  async confirmTotp(userId: string, code: string): Promise<StaffRecoveryCodesResponse> {
    const credential = await this.prisma.totpCredential.findUnique({ where: { userId }, select: { id: true, encryptedSecret: true, confirmedAt: true, disabledAt: true } });
    if (!credential || credential.confirmedAt || credential.disabledAt) throw new StaffMfaException();
    let result: Awaited<ReturnType<typeof verify>>;
    try { result = await verify({ secret: this.crypto.decrypt(credential.encryptedSecret), token: code, epochTolerance: 30 }); } catch { throw new StaffMfaException(); }
    if (!result.valid) throw new StaffMfaException();
    const recoveryCodes = Array.from({ length: 10 }, () => `RECOVERY-${randomBytes(10).toString('base64url').toUpperCase()}`);
    await this.prisma.$transaction(async tx => {
      const confirmed = await tx.totpCredential.updateMany({ where: { id: credential.id, confirmedAt: null, disabledAt: null }, data: { confirmedAt: new Date(), lastAcceptedStep: (result as unknown as { timeStep: number }).timeStep } });
      if (confirmed.count !== 1) throw new StaffMfaException();
      await tx.recoveryCode.deleteMany({ where: { totpCredentialId: credential.id } });
      await tx.recoveryCode.createMany({ data: recoveryCodes.map(codeValue => ({ totpCredentialId: credential.id, codeHash: this.hashes.hash(codeValue, 'recovery-code') })) });
      await tx.auditLog.create({ data: { actorId: userId, action: 'auth.totp.enrolled', entityType: 'TotpCredential', entityId: credential.id, requestId: getRequestId(), metadata: { state: 'CONFIRMED', recoveryCodeCount: 10 } } });
    });
    return { data: { recoveryCodes } };
  }

  async regenerateRecoveryCodes(userId: string, currentSessionId: string): Promise<StaffRecoveryCodesResponse> {
    const credential = await this.prisma.totpCredential.findUnique({ where: { userId }, select: { id: true, confirmedAt: true, disabledAt: true } });
    if (!credential?.confirmedAt || credential.disabledAt) throw new StaffMfaException();
    const recoveryCodes = Array.from({ length: 10 }, () => `RECOVERY-${randomBytes(10).toString('base64url').toUpperCase()}`);
    await this.prisma.$transaction(async tx => {
      await tx.recoveryCode.updateMany({ where: { totpCredentialId: credential.id, consumedAt: null, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
      await tx.recoveryCode.createMany({ data: recoveryCodes.map(codeValue => ({ totpCredentialId: credential.id, codeHash: this.hashes.hash(codeValue, 'recovery-code') })) });
      await tx.auditLog.create({ data: { actorId: userId, action: 'auth.recovery_regenerated', entityType: 'TotpCredential', entityId: credential.id, requestId: getRequestId(), metadata: { recoveryCodeCount: 10 } } });
    });
    await this.sessions.revokeOtherSessionFamilies({ userId, currentSessionId });
    return { data: { recoveryCodes } };
  }

  async verifyTotp(command: StaffTotpCommand): Promise<StaffMfaResult> {
    const ipAddress = command.ipAddress?.trim() || 'unknown';
    await this.limits.enforce({ dimension: 'staff-mfa:ip', value: ipAddress, context: 'ip' });

    const challengeHashes = this.hashes.candidateHashes(command.challengeToken, 'mfa-challenge');
    const challenge = await this.prisma.mfaChallenge.findFirst({
      where: { challengeTokenHash: { in: [...challengeHashes] } },
      include: { user: { include: { totpCredential: true } } },
    });
    if (!challenge || challenge.purpose !== MfaChallengePurpose.STAFF_SIGN_IN) throw new StaffMfaException();

    const now = new Date();
    if (
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= Math.min(challenge.maxAttempts, MFA_MAX_ATTEMPTS) ||
      challenge.user.status !== UserStatus.ACTIVE ||
      !challenge.user.totpCredential?.confirmedAt ||
      challenge.user.totpCredential.disabledAt
    ) {
      throw new StaffMfaException();
    }

    let verified: Awaited<ReturnType<typeof verify>>;
    try {
      verified = await verify({
        secret: this.crypto.decrypt(challenge.user.totpCredential.encryptedSecret),
        token: command.code,
        epochTolerance: 30,
        ...(challenge.user.totpCredential.lastAcceptedStep !== null
          ? { afterTimeStep: challenge.user.totpCredential.lastAcceptedStep }
          : {}),
      });
    } catch {
      verified = { valid: false } as Awaited<ReturnType<typeof verify>>;
    }

    if (!verified.valid) {
      await this.recordFailure(challenge.id, challenge.user.id, ipAddress);
      throw new StaffMfaException();
    }

    const requestId = getRequestId();
    const consumed = await this.prisma.$transaction(
      async tx => {
        const marked = await tx.mfaChallenge.updateMany({
          where: {
            id: challenge.id,
            consumedAt: null,
            invalidatedAt: null,
            attempts: { lt: Math.min(challenge.maxAttempts, MFA_MAX_ATTEMPTS) },
          },
          data: { consumedAt: now },
        });
        if (marked.count !== 1) return false;

        const step = (verified as unknown as { timeStep: number }).timeStep;
        const credential = await tx.totpCredential.updateMany({
          where: {
            id: challenge.user.totpCredential!.id,
            disabledAt: null,
            ...(challenge.user.totpCredential!.lastAcceptedStep === null
              ? { lastAcceptedStep: null }
              : { lastAcceptedStep: challenge.user.totpCredential!.lastAcceptedStep }),
          },
          data: { lastAcceptedStep: step },
        });
        if (credential.count !== 1) return false;

        await tx.user.update({
          where: { id: challenge.user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
        });

        await tx.loginAttempt.create({
          data: {
            userId: challenge.user.id,
            identifierHash: challenge.user.email ? this.hashes.hash(challenge.user.email, 'identifier') : null,
            ipHash: this.hashes.hash(ipAddress, 'ip'),
            method: LoginMethod.TOTP,
            outcome: LoginAttemptOutcome.SUCCESS,
            requestId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: challenge.user.id,
            action: 'auth.staff.mfa_verified',
            entityType: 'User',
            entityId: challenge.user.id,
            requestId,
            metadata: { method: 'TOTP', challengeId: challenge.id },
          },
        });
        return true;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    if (!consumed) throw new StaffMfaException();

    return this.issueSession(challenge.user.id, command, ipAddress, now);
  }

  async verifyRecovery(command: StaffRecoveryCommand): Promise<StaffMfaResult> {
    const ipAddress = command.ipAddress?.trim() || 'unknown';
    await this.limits.enforce({ dimension: 'staff-mfa:ip', value: ipAddress, context: 'ip' });
    const challengeHashes = this.hashes.candidateHashes(command.challengeToken, 'mfa-challenge');
    const challenge = await this.prisma.mfaChallenge.findFirst({
      where: { challengeTokenHash: { in: [...challengeHashes] } },
      include: { user: { include: { totpCredential: true } } },
    });
    if (!challenge || challenge.purpose !== MfaChallengePurpose.STAFF_SIGN_IN) throw new StaffMfaException();
    const now = new Date();
    if (
      challenge.consumedAt ||
      challenge.invalidatedAt ||
      challenge.expiresAt <= now ||
      challenge.attempts >= Math.min(challenge.maxAttempts, MFA_MAX_ATTEMPTS) ||
      challenge.user.status !== UserStatus.ACTIVE ||
      !challenge.user.totpCredential?.confirmedAt ||
      challenge.user.totpCredential.disabledAt
    ) throw new StaffMfaException();

    const hashes = this.hashes.candidateHashes(command.code, 'recovery-code');
    const recovery = await this.prisma.recoveryCode.findFirst({
      where: {
        totpCredentialId: challenge.user.totpCredential.id,
        codeHash: { in: [...hashes] },
        consumedAt: null,
        invalidatedAt: null,
      },
    });
    if (!recovery) {
      await this.recordFailure(challenge.id, challenge.user.id, ipAddress);
      throw new StaffMfaException();
    }

    const consumed = await this.prisma.$transaction(async tx => {
      const code = await tx.recoveryCode.updateMany({
        where: { id: recovery.id, consumedAt: null, invalidatedAt: null },
        data: { consumedAt: now },
      });
      const challengeUpdate = await tx.mfaChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, invalidatedAt: null },
        data: { consumedAt: now },
      });
      if (code.count !== 1 || challengeUpdate.count !== 1) return false;
      await tx.user.update({ where: { id: challenge.user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
      await tx.loginAttempt.create({
        data: {
          userId: challenge.user.id,
          identifierHash: challenge.user.email ? this.hashes.hash(challenge.user.email, 'identifier') : null,
          ipHash: this.hashes.hash(ipAddress, 'ip'),
          method: LoginMethod.RECOVERY_CODE,
          outcome: LoginAttemptOutcome.SUCCESS,
          requestId: getRequestId(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: challenge.user.id,
          action: 'auth.staff.mfa_verified',
          entityType: 'User',
          entityId: challenge.user.id,
          requestId: getRequestId(),
          metadata: { method: 'RECOVERY_CODE', challengeId: challenge.id },
        },
      });
      return true;
    });
    if (!consumed) throw new StaffMfaException();
    return this.issueSession(challenge.user.id, command, ipAddress, now);
  }

  private async issueSession(
    userId: string,
    command: { deviceName?: string; userAgent?: string },
    ipAddress: string,
    now: Date,
  ): Promise<StaffMfaResult> {
    const issued = await this.sessions.createSession({
      userId,
      authenticationLevel: 'STAFF_MFA',
      authenticatedAt: now,
      deviceName: command.deviceName,
      ipAddress,
      userAgent: command.userAgent,
    });
    await this.limits.reset({ dimension: 'staff-password:ip', value: ipAddress, context: 'ip' });
    await this.limits.reset({ dimension: 'staff-mfa:ip', value: ipAddress, context: 'ip' });
    const principal = await this.principals.resolveBearerToken(`Bearer ${issued.accessToken}`);
    return {
      refreshToken: issued.refreshToken,
      csrfToken: issued.csrfToken,
      expiresAt: issued.expiresAt,
      response: {
        data: {
          accessToken: issued.accessToken,
          tokenType: 'Bearer',
          expiresInSeconds: 600,
          principal: {
            userId: principal.userId,
            sessionId: issued.sessionId,
            authenticationLevel: 'STAFF_MFA',
            permissions: [...principal.permissions],
            authenticatedAt: principal.authenticatedAt.toISOString(),
            accessExpiresAt: principal.accessExpiresAt.toISOString(),
          },
        },
      },
    };
  }

  private async recordFailure(challengeId: string, userId: string, ipAddress: string): Promise<void> {
    const requestId = getRequestId();
    await this.prisma.$transaction(async tx => {
      const challenge = await tx.mfaChallenge.findUnique({ where: { id: challengeId }, select: { attempts: true, maxAttempts: true } });
      if (!challenge) return;
      const attempts = challenge.attempts + 1;
      await tx.mfaChallenge.update({
        where: { id: challengeId },
        data: { attempts, ...(attempts >= Math.min(challenge.maxAttempts, MFA_MAX_ATTEMPTS) ? { invalidatedAt: new Date() } : {}) },
      });
      await tx.loginAttempt.create({
        data: {
          userId,
          ipHash: this.hashes.hash(ipAddress, 'ip'),
          method: LoginMethod.TOTP,
          outcome: LoginAttemptOutcome.INVALID_CODE,
          requestId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.staff.mfa_failed',
          entityType: 'User',
          entityId: userId,
          requestId,
          metadata: { method: 'TOTP', challengeId },
        },
      });
    });
  }
}
