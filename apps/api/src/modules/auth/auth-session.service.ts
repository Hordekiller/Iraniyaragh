import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, UserStatus, type AuthenticationLevel, type Session } from '@prisma/client';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuthHashService } from './auth-hash.service';
import { AuthTokenService } from './auth-token.service';
import {
  REFRESH_RECOVERY_WINDOW_MS,
  attemptHashMatches,
  hashAttemptId,
  openRecovery,
  sealRecovery,
} from './refresh-recovery';

const CUSTOMER_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const CUSTOMER_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const STAFF_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1_000;
const STAFF_INACTIVITY_TTL_MS = 30 * 60 * 1_000;
const MAX_SERIALIZABLE_ATTEMPTS = 5;
const SERIALIZABLE_RETRY_DELAY_MS = 25;
const MAX_DEVICE_NAME_LENGTH = 150;
const MAX_USER_AGENT_LENGTH = 1_000;

export const AUTH_SESSION_REVOKE_REASON = Object.freeze({
  credentialChanged: 'CREDENTIAL_CHANGED',
  expired: 'EXPIRED',
  inactivity: 'INACTIVITY',
  invalidEvidence: 'AUTHENTICATION_EVIDENCE_INVALID',
  logout: 'LOGOUT',
  logoutAll: 'LOGOUT_ALL',
  replayDetected: 'REPLAY_DETECTED',
  revoked: 'REVOKED',
  rotated: 'ROTATED',
  userInactive: 'USER_INACTIVE',
} as const);

export type AuthSessionRevokeReason = (typeof AUTH_SESSION_REVOKE_REASON)[keyof typeof AUTH_SESSION_REVOKE_REASON];

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

export type AuthSessionSummary = Readonly<{
  sessionId: string;
  current: boolean;
  deviceName: string | null;
  authenticationLevel: AuthenticationLevel;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
}>;

export type RevokeUserSessionOutcome = 'revoked' | 'alreadyRevoked' | 'notFound';

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
      /** Present only when the stored outcome of an earlier, identical attempt was replayed. */
      recovered?: { refreshToken: string; csrfToken: string };
    };

class SessionRotationRaceError extends Error {
  constructor() {
    super('Session rotation compare-and-swap lost.');
    this.name = 'SessionRotationRaceError';
  }
}

/** Minimum spacing between persisted activity writes for one session. */
export const ACTIVITY_TOUCH_MIN_INTERVAL_MS = 60_000;

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

  async rotateSession(
    rawRefreshToken: string,
    expectedLevel?: AuthenticationLevel,
    attemptId?: string,
  ): Promise<IssuedAuthSession> {
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
      // Wrong realm: reject without touching (or revoking) the other realm's session.
      if (expectedLevel !== undefined && session.authenticationLevel !== expectedLevel) return { kind: 'invalid' };

      if (
        session.revokedAt !== null &&
        session.revokeReason === AUTH_SESSION_REVOKE_REASON.rotated &&
        session.replacedBySessionId !== null
      ) {
        // Idempotent recovery of the SAME attempt inside the bounded window. Every
        // condition must hold; anything else is a genuine replay (family revoked).
        const recovered = attemptId ? await this.recoverAttempt(tx, session, rawRefreshToken, attemptId, now) : undefined;
        if (recovered) return recovered;
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

      if (attemptId) {
        // Same transaction as the rotation: either both commit or neither does.
        await tx.refreshRecovery.create({
          data: {
            previousSessionId: session.id,
            successorSessionId: replacement.id,
            attemptHash: hashAttemptId(attemptId),
            sealed: sealRecovery(
              { refreshToken: replacementRefreshToken, csrfToken },
              rawRefreshToken,
              attemptId,
              `${session.id}>${replacement.id}`,
            ),
            createdAt: now,
            expiresAt: new Date(now.getTime() + REFRESH_RECOVERY_WINDOW_MS),
          },
        });
      }

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
    if (attemptId) void this.purgeExpiredRecoveries();
    return Object.freeze({
      accessToken: result.accessToken,
      csrfToken: result.recovered?.csrfToken ?? csrfToken,
      expiresAt: result.session.expiresAt,
      refreshToken: result.recovered?.refreshToken ?? replacementRefreshToken,
      sessionId: result.session.id,
      tokenFamilyId: result.session.tokenFamilyId,
    });
  }

  /** Best-effort cleanup of expired recovery rows; never affects a rotation. */
  async purgeExpiredRecoveries(now: Date = new Date()): Promise<number> {
    try {
      const { count } = await this.prisma.refreshRecovery.deleteMany({ where: { expiresAt: { lte: now } } });
      return count;
    } catch {
      return 0;
    }
  }

  private async recoverAttempt(
    tx: Prisma.TransactionClient,
    previous: Session & { user: { status: UserStatus } },
    rawRefreshToken: string,
    attemptId: string,
    now: Date,
  ): Promise<SessionTransactionResult | undefined> {
    const record = await tx.refreshRecovery.findUnique({ where: { previousSessionId: previous.id } });
    if (!record || record.expiresAt <= now || !attemptHashMatches(record.attemptHash, attemptId)) return undefined;
    // The successor must still be the live head of the SAME family and realm. A
    // logout, revocation, credential change, expiry or a further rotation all
    // make recovery impossible.
    const successor = await tx.session.findFirst({
      where: {
        id: record.successorSessionId,
        tokenFamilyId: previous.tokenFamilyId,
        authenticationLevel: previous.authenticationLevel,
        revokedAt: null,
        replacedBySessionId: null,
      },
    });
    if (!successor || this.invalidReason(successor, previous.user.status, now)) return undefined;
    const opened = openRecovery(record.sealed, rawRefreshToken, attemptId, `${previous.id}>${successor.id}`);
    if (!opened) return undefined;
    await tx.auditLog.create({
      data: {
        actorId: previous.userId,
        action: 'auth.session.refresh_recovered',
        entityType: 'Session',
        entityId: previous.id,
        requestId: getRequestId(),
        metadata: { sessionId: successor.id, tokenFamilyId: previous.tokenFamilyId },
      },
    });
    return {
      kind: 'success',
      accessToken: this.tokens.signAccessToken({
        userId: successor.userId,
        sessionId: successor.id,
        authenticationLevel: successor.authenticationLevel,
        authenticatedAt: successor.authenticatedAt,
      }),
      session: { expiresAt: successor.expiresAt, id: successor.id, tokenFamilyId: successor.tokenFamilyId },
      recovered: opened,
    };
  }

  /**
   * Record genuine user activity for the already-validated live session. The
   * caller's guard has enforced revocation, absolute expiry and the current
   * inactivity deadline, so an idle session can never be revived here. Writes
   * are throttled and never move lastUsedAt backwards.
   */
  async touchActivity(sessionId: string, now: Date = new Date()): Promise<boolean> {
    const current = await this.prisma.session.findFirst({
      where: { id: sessionId, revokedAt: null },
      select: { authenticatedAt: true, authenticationLevel: true, createdAt: true, expiresAt: true, lastUsedAt: true, user: { select: { status: true } } },
    });
    // Defence in depth: never revive a session already past its deadlines.
    if (!current || this.invalidReason(current, current.user.status, now)) return false;
    const threshold = new Date(now.getTime() - ACTIVITY_TOUCH_MIN_INTERVAL_MS);
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: { gt: now },
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: threshold } }],
      },
      data: { lastUsedAt: now },
    });
    return result.count > 0;
  }

  async listSessions(userId: string, currentSessionId: string): Promise<readonly AuthSessionSummary[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: {
        id: true,
        deviceName: true,
        authenticationLevel: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(session =>
      Object.freeze({
        sessionId: session.id,
        current: session.id === currentSessionId,
        deviceName: session.deviceName,
        authenticationLevel: session.authenticationLevel,
        createdAt: session.createdAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
      }),
    );
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    reason: AuthSessionRevokeReason = AUTH_SESSION_REVOKE_REASON.logout,
  ): Promise<boolean> {
    const requestId = getRequestId();
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

  async revokeByRefreshToken(rawRefreshToken: string): Promise<boolean> {
    const candidateHashes = this.candidateRefreshHashes(rawRefreshToken);
    const requestId = getRequestId();
    return this.runSerializable(async tx => {
      const found = await tx.session.findFirst({
        where: { refreshTokenHash: { in: [...candidateHashes] } },
        select: { id: true, userId: true, revokedAt: true, revokeReason: true, tokenFamilyId: true },
      });
      if (!found) return false;
      if (found.revokedAt !== null) {
        // A rotated token whose response was lost can still be the only credential
        // the browser holds. Logging out with it must end the whole login, never
        // leave the unseen successor alive. (Revoking is always the safe direction.)
        if (found.revokeReason !== AUTH_SESSION_REVOKE_REASON.rotated) return false;
        const family = await tx.session.updateMany({
          where: { tokenFamilyId: found.tokenFamilyId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: AUTH_SESSION_REVOKE_REASON.logout },
        });
        if (family.count === 0) return false;
        await tx.auditLog.create({
          data: {
            actorId: found.userId,
            action: 'auth.session.revoked',
            entityType: 'Session',
            entityId: found.id,
            requestId,
            metadata: { reason: AUTH_SESSION_REVOKE_REASON.logout, revokedSessionCount: family.count, viaRotatedToken: true },
          },
        });
        return true;
      }
      const session = found;

      const revoked = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: AUTH_SESSION_REVOKE_REASON.logout },
      });
      if (revoked.count !== 1) return false;

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'auth.session.revoked',
          entityType: 'Session',
          entityId: session.id,
          requestId,
          metadata: { reason: AUTH_SESSION_REVOKE_REASON.logout },
        },
      });
      return true;
    });
  }

  async revokeUserSession(
    userId: string,
    sessionId: string,
    reason: AuthSessionRevokeReason = AUTH_SESSION_REVOKE_REASON.revoked,
  ): Promise<RevokeUserSessionOutcome> {
    const requestId = getRequestId();
    return this.runSerializable(async tx => {
      const owned = await tx.session.findUnique({
        where: { id: sessionId },
        select: { userId: true, revokedAt: true },
      });
      if (!owned || owned.userId !== userId) return 'notFound' as const;
      if (owned.revokedAt !== null) return 'alreadyRevoked' as const;

      const revoked = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: reason },
      });
      if (revoked.count !== 1) return 'alreadyRevoked' as const;

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
      return 'revoked' as const;
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

  /**
   * Revokes every live session family of the user except the current session's
   * family while keeping the current session valid and leaving its family
   * untouched. The current session must exist, be unrevoked and not expired;
   * otherwise the whole family is treated as invalid. Used for sensitive
   * operations that need to evict other devices but must not drop this one.
   */
  async revokeOtherSessionFamilies(command: {
    userId: string;
    currentSessionId: string;
    reason?: AuthSessionRevokeReason;
  }): Promise<number> {
    const requestId = getRequestId();
    const reason = command.reason ?? AUTH_SESSION_REVOKE_REASON.credentialChanged;
    return this.runSerializable(async tx => {
      const now = new Date();
      const session = await tx.session.findFirst({
        where: { id: command.currentSessionId, userId: command.userId },
        include: { user: { select: { status: true } } },
      });
      if (!session || session.revokedAt !== null) throw new AuthSessionException('AUTH_SESSION_INVALID');

      const invalidReason = this.invalidReason(session, session.user.status, now);
      if (invalidReason) {
        await tx.session.updateMany({
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
            metadata: { reason: invalidReason },
          },
        });
        throw new AuthSessionException('AUTH_SESSION_INVALID');
      }

      const otherRevoked = await tx.session.updateMany({
        where: {
          userId: command.userId,
          tokenFamilyId: { not: session.tokenFamilyId },
          revokedAt: null,
        },
        data: { revokedAt: now, revokeReason: reason },
      });
      if (otherRevoked.count > 0) {
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'auth.session.all_revoked',
            entityType: 'User',
            entityId: session.userId,
            requestId,
            metadata: {
              reason,
              revokedSessionCount: otherRevoked.count,
            },
          },
        });
      }
      return otherRevoked.count;
    });
  }

  async rotateSessionAfterCredentialChange(command: {
    userId: string;
    currentSessionId: string;
    passwordHash: string;
    passwordChangedAt: Date;
  }): Promise<IssuedAuthSession> {
    const replacementId = randomUUID();
    const replacementRefreshToken = this.tokens.generateRefreshToken();
    const replacementRefreshHash = this.hashes.hash(replacementRefreshToken, 'refresh');
    const csrfToken = this.tokens.generateCsrfToken();
    const requestId = getRequestId();

    const result = await this.runSerializable<SessionTransactionResult>(async tx => {
      const now = new Date();
      const session = await tx.session.findFirst({
        where: { id: command.currentSessionId, userId: command.userId },
        include: { user: { select: { status: true } } },
      });
      if (!session || session.revokedAt !== null) return { kind: 'invalid' };

      const invalidReason = this.invalidReason(session, session.user.status, now);
      if (invalidReason) {
        await tx.session.updateMany({
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
            metadata: { reason: invalidReason },
          },
        });
        return { kind: 'invalid' };
      }

      const otherRevoked = await tx.session.updateMany({
        where: {
          userId: command.userId,
          tokenFamilyId: { not: session.tokenFamilyId },
          revokedAt: null,
        },
        data: { revokedAt: now, revokeReason: AUTH_SESSION_REVOKE_REASON.credentialChanged },
      });
      if (otherRevoked.count > 0) {
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: 'auth.session.all_revoked',
            entityType: 'User',
            entityId: session.userId,
            requestId,
            metadata: {
              reason: AUTH_SESSION_REVOKE_REASON.credentialChanged,
              revokedSessionCount: otherRevoked.count,
            },
          },
        });
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
          // Not `rotated`: access tokens signed before a credential change must not survive it.
          revokeReason: AUTH_SESSION_REVOKE_REASON.credentialChanged,
        },
      });
      if (rotated.count !== 1) throw new SessionRotationRaceError();

      await tx.user.update({
        where: { id: command.userId },
        data: { passwordHash: command.passwordHash, passwordChangedAt: command.passwordChangedAt },
      });
      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          action: 'auth.password.changed',
          entityType: 'User',
          entityId: session.userId,
          requestId,
          metadata: {
            authenticationLevel: session.authenticationLevel,
            rotatedSessionId: replacement.id,
          },
        },
      });
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

    if (result.kind !== 'success') throw new AuthSessionException('AUTH_SESSION_INVALID');
    return Object.freeze({
      accessToken: result.accessToken,
      csrfToken,
      expiresAt: result.session.expiresAt,
      refreshToken: replacementRefreshToken,
      sessionId: result.session.id,
      tokenFamilyId: result.session.tokenFamilyId,
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
        await this.delay(SERIALIZABLE_RETRY_DELAY_MS * attempt);
      }
    }
    throw new Error('Unreachable serializable transaction state.');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof SessionRotationRaceError ||
      (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2034')
    );
  }
}
