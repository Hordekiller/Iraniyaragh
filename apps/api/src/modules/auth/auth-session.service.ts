import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserStatus, type AuthenticationLevel, type Session } from '@prisma/client';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuthHashService } from './auth-hash.service';
import { AuthTokenService } from './auth-token.service';

const CUSTOMER_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const CUSTOMER_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const STAFF_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1_000;
const STAFF_INACTIVITY_TTL_MS = 30 * 60 * 1_000;
const MAX_SERIALIZABLE_ATTEMPTS = 5;
const MAX_DEVICE_NAME_LENGTH = 150;
const MAX_USER_AGENT_LENGTH = 1_000;

export const AUTH_SESSION_REVOKE_REASON = Object.freeze({
  expired: 'EXPIRED',
  inactivity: 'INACTIVITY',
  invalidEvidence: 'AUTHENTICATION_EVIDENCE_INVALID',
  logout: 'LOGOUT',
  logoutAll: 'LOGOUT_ALL',
  replayDetected: 'REPLAY_DETECTED',
  rotated: 'ROTATED',
  userInactive: 'USER_INACTIVE',
} as const);

type AuthSessionRevokeReason = (typeof AUTH_SESSION_REVOKE_REASON)[keyof typeof AUTH_SESSION_REVOKE_REASON];

export type CreateAuthSessionInput = Readonly<{
  userId: string;
  authenticationLevel: AuthenticationLevel;
  authenticatedAt: Date;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}>;

export type IssuedAuthSession = Readonly<{
  accessToken: string;
  csrfToken: string;
  expiresAt: Date;
  refreshToken: string;
  sessionId: string;
  tokenFamilyId: string;
}>;

export type AuthSessionErrorCode = 'AUTH_SESSION_INVALID' | 'AUTH_SESSION_REPLAYED';

export class AuthSessionException extends UnauthorizedException {
  constructor(readonly authCode: AuthSessionErrorCode) {
    super({
      code: authCode,
      message:
        authCode === 'AUTH_SESSION_REPLAYED'
          ? 'Session replay was detected. Reauthentication is required.'
          : 'The session is missing, expired, revoked, or otherwise invalid.',
    });
    this.name = 'AuthSessionException';
  }
}

type SessionTransactionResult =
  | { kind: 'invalid' }
  | { kind: 'replayed' }
  | {
      kind: 'success';
      accessToken: string;
      session: Pick<Session, 'expiresAt' | 'id' | 'tokenFamilyId'>;
    };

class SessionRotationRaceError extends Error {
  constructor() {
    super('Session rotation compare-and-swap lost.');
    this.name = 'SessionRotationRaceError';
  }
}

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashes: AuthHashService,
    private readonly tokens: AuthTokenService,
  ) {}

  async createSession(input: CreateAuthSessionInput): Promise<IssuedAuthSession> {
    const now = new Date();
    const expiresAt = new Date(input.authenticatedAt.getTime() + this.absoluteTtlMs(input.authenticationLevel));
    if (
      !this.isValidDate(input.authenticatedAt) ||
      input.authenticatedAt > now ||
      !this.isValidDate(expiresAt) ||
      expiresAt <= now
    ) {
      throw new AuthSessionException('AUTH_SESSION_INVALID');
    }

    const sessionId = randomUUID();
    const tokenFamilyId = this.tokens.generateTokenFamilyId();
    const refreshToken = this.tokens.generateRefreshToken();
    const csrfToken = this.tokens.generateCsrfToken();
    const refreshTokenHash = this.hashes.hash(refreshToken, 'refresh');
    const accessToken = this.tokens.signAccessToken({
      userId: input.userId,
      sessionId,
      authenticationLevel: input.authenticationLevel,
      authenticatedAt: input.authenticatedAt,
    });
    const deviceName = this.normalizeDisplayText(input.deviceName, MAX_DEVICE_NAME_LENGTH, 'deviceName');
    const userAgent = this.normalizeDisplayText(input.userAgent, MAX_USER_AGENT_LENGTH, 'userAgent');
    const requestId = getRequestId();

    const created = await this.runSerializable(async tx => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { status: true },
      });
      if (user?.status !== UserStatus.ACTIVE) return false;

      await tx.session.create({
        data: {
          id: sessionId,
          userId: input.userId,
          refreshTokenHash,
          tokenFamilyId,
          authenticationLevel: input.authenticationLevel,
          authenticatedAt: input.authenticatedAt,
          deviceIdHash: input.deviceId ? this.hashes.hash(input.deviceId, 'device') : null,
          deviceName,
          userAgent,
          ipHash: input.ipAddress ? this.hashes.hash(input.ipAddress, 'ip') : null,
          lastUsedAt: now,
          expiresAt,
          createdAt: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: 'auth.session.created',
          entityType: 'Session',
          entityId: sessionId,
          requestId,
          metadata: { authenticationLevel: input.authenticationLevel, tokenFamilyId },
        },
      });
      return true;
    });

    if (!created) throw new AuthSessionException('AUTH_SESSION_INVALID');
    return Object.freeze({ accessToken, csrfToken, expiresAt, refreshToken, sessionId, tokenFamilyId });
  }

  async rotateSession(rawRefreshToken: string): Promise<IssuedAuthSession> {
    const candidateHashes = this.candidateRefreshHashes(rawRefreshToken);
    const replacementId = randomUUID();
    const replacementRefreshToken = this.tokens.generateRefreshToken();
    const replacementRefreshHash = this.hashes.hash(replacementRefreshToken, 'refresh');
    const csrfToken = this.tokens.generateCsrfToken();
    const requestId = getRequestId();

    const result = await this.runSerializable<SessionTransactionResult>(async tx => {
      const now = new Date();
      const session = await tx.session.findFirst({
        where: { refreshTokenHash: { in: [...candidateHashes] } },
        include: { user: { select: { status: true } } },
      });
      if (!session) return { kind: 'invalid' };

      if (
        session.revokedAt !== null &&
        session.revokeReason === AUTH_SESSION_REVOKE_REASON.rotated &&
        session.replacedBySessionId !== null
      ) {
        const revoked = await tx.session.updateMany({
          where: { tokenFamilyId: session.tokenFamilyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: AUTH_SESSION_REVOKE_REASON.replayDetected },
        });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'auth.session.replay_detected',
            entityType: 'Session',
            entityId: session.id,
            requestId,
            metadata: {
              revokedSessionCount: revoked.count,
              tokenFamilyId: session.tokenFamilyId,
            },
          },
        });
        return { kind: 'replayed' };
      }

      if (session.revokedAt !== null) return { kind: 'invalid' };

      const invalidReason = this.invalidReason(session, session.user.status, now);
      if (invalidReason) {
        const revoked = await tx.session.updateMany({
          where: { tokenFamilyId: session.tokenFamilyId, revokedAt: null },
          data: { revokedAt: now, revokeReason: invalidReason },
        });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'auth.session.revoked',
            entityType: 'Session',
            entityId: session.id,
            requestId,
            metadata: { reason: invalidReason, revokedSessionCount: revoked.count },
          },
        });
        return { kind: 'invalid' };
      }

      const accessToken = this.tokens.signAccessToken({
        userId: session.userId,
        sessionId: replacementId,
        authenticationLevel: session.authenticationLevel,
        authenticatedAt: session.authenticatedAt,
      });
      const replacement = await tx.session.create({
        data: {
          id: replacementId,
          userId: session.userId,
          refreshTokenHash: replacementRefreshHash,
          tokenFamilyId: session.tokenFamilyId,
          authenticationLevel: session.authenticationLevel,
          authenticatedAt: session.authenticatedAt,
          deviceIdHash: session.deviceIdHash,
          deviceName: session.deviceName,
          userAgent: session.userAgent,
          ipHash: session.ipHash,
          lastUsedAt: now,
          expiresAt: session.expiresAt,
          createdAt: now,
        },
        select: { expiresAt: true, id: true, tokenFamilyId: true },
      });
      const rotated = await tx.session.updateMany({
        where: { id: session.id, replacedBySessionId: null, revokedAt: null },
        data: {
          replacedBySessionId: replacement.id,
          revokedAt: now,
          revokeReason: AUTH_SESSION_REVOKE_REASON.rotated,
        },
      });
      if (rotated.count !== 1) throw new SessionRotationRaceError();

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'auth.session.rotated',
          entityType: 'Session',
          entityId: session.id,
          requestId,
          metadata: { newSessionId: replacement.id, tokenFamilyId: session.tokenFamilyId },
        },
      });
      return { kind: 'success', accessToken, session: replacement };
    });

    if (result.kind === 'replayed') throw new AuthSessionException('AUTH_SESSION_REPLAYED');
    if (result.kind === 'invalid') throw new AuthSessionException('AUTH_SESSION_INVALID');
    return Object.freeze({
      accessToken: result.accessToken,
      csrfToken,
      expiresAt: result.session.expiresAt,
      refreshToken: replacementRefreshToken,
      sessionId: result.session.id,
      tokenFamilyId: result.session.tokenFamilyId,
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    const requestId = getRequestId();
    const reason = AUTH_SESSION_REVOKE_REASON.logout;
    return this.runSerializable(async tx => {
      const revoked = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      });
      if (revoked.count === 0) return false;

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.session.revoked',
          entityType: 'Session',
          entityId: sessionId,
          requestId,
          metadata: { reason },
        },
      });
      return true;
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const requestId = getRequestId();
    const reason = AUTH_SESSION_REVOKE_REASON.logoutAll;
    return this.runSerializable(async tx => {
      const revoked = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.session.all_revoked',
          entityType: 'User',
          entityId: userId,
          requestId,
          metadata: { reason, revokedSessionCount: revoked.count },
        },
      });
      return revoked.count;
    });
  }

  private candidateRefreshHashes(rawRefreshToken: string): readonly string[] {
    try {
      return this.hashes.candidateHashes(rawRefreshToken, 'refresh');
    } catch {
      throw new AuthSessionException('AUTH_SESSION_INVALID');
    }
  }

  private invalidReason(
    session: Pick<
      Session,
      'authenticatedAt' | 'authenticationLevel' | 'createdAt' | 'expiresAt' | 'lastUsedAt'
    >,
    userStatus: UserStatus,
    now: Date,
  ): AuthSessionRevokeReason | undefined {
    if (userStatus !== UserStatus.ACTIVE) return AUTH_SESSION_REVOKE_REASON.userInactive;
    if (session.authenticatedAt > now) return AUTH_SESSION_REVOKE_REASON.invalidEvidence;
    if (session.expiresAt <= now) return AUTH_SESSION_REVOKE_REASON.expired;

    const lastActivity = session.lastUsedAt ?? session.createdAt;
    const inactivityDeadline = new Date(lastActivity.getTime() + this.inactivityTtlMs(session.authenticationLevel));
    if (inactivityDeadline <= now) return AUTH_SESSION_REVOKE_REASON.inactivity;
    return undefined;
  }

  private absoluteTtlMs(level: AuthenticationLevel): number {
    if (level === 'CUSTOMER_OTP') return CUSTOMER_ABSOLUTE_TTL_MS;
    if (level === 'STAFF_MFA') return STAFF_ABSOLUTE_TTL_MS;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }

  private inactivityTtlMs(level: AuthenticationLevel): number {
    if (level === 'CUSTOMER_OTP') return CUSTOMER_INACTIVITY_TTL_MS;
    if (level === 'STAFF_MFA') return STAFF_INACTIVITY_TTL_MS;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }

  private normalizeDisplayText(value: string | undefined, maxLength: number, field: string): string | null {
    if (value === undefined) return null;
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > maxLength || this.hasControlCharacter(normalized)) {
      throw new TypeError(`${field} must be non-empty, control-character-free text of at most ${maxLength} characters.`);
    }
    return normalized;
  }

  private isValidDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private hasControlCharacter(value: string): boolean {
    return [...value].some(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    });
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
      error instanceof SessionRotationRaceError ||
      (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034')
    );
  }
}
