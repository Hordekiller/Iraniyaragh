import { Injectable } from '@nestjs/common';
import { UserStatus, type AuthenticationLevel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthSessionException } from './auth-session.service';
import { AuthTokenService, type VerifiedAccessToken } from './auth-token.service';

const CUSTOMER_INACTIVITY_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const STAFF_INACTIVITY_TTL_MS = 30 * 60 * 1_000;
const MAX_ACCESS_TOKEN_LENGTH = 4096;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_.~+/=-]+)$/u;

export type AuthPrincipalContext = Readonly<{
  userId: string;
  sessionId: string;
  tokenId: string;
  authenticationLevel: AuthenticationLevel;
  authenticatedAt: Date;
  accessExpiresAt: Date;
  permissions: ReadonlySet<string>;
}>;

@Injectable()
export class AuthPrincipalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly permissions: AuthPermissionService,
  ) {}

  async resolveBearerToken(rawAuthorization: string | undefined): Promise<AuthPrincipalContext> {
    const token = this.extractBearerToken(rawAuthorization);
    const verified = this.verifyToken(token);
    return this.loadPrincipal(verified);
  }

  private extractBearerToken(rawAuthorization: string | undefined): string {
    if (typeof rawAuthorization !== 'string') throw new AuthSessionException('AUTH_SESSION_INVALID');
    const token = rawAuthorization.trim().slice(0, MAX_ACCESS_TOKEN_LENGTH);
    const match = BEARER_PATTERN.exec(token);
    if (!match) throw new AuthSessionException('AUTH_SESSION_INVALID');
    return match[1] as string;
  }

  private verifyToken(token: string): VerifiedAccessToken {
    try {
      return this.tokens.verifyAccessToken(token);
    } catch {
      throw new AuthSessionException('AUTH_SESSION_INVALID');
    }
  }

  private async loadPrincipal(verified: VerifiedAccessToken): Promise<AuthPrincipalContext> {
    const now = new Date();
    const session = await this.prisma.session.findFirst({
      where: { id: verified.sessionId, userId: verified.userId, revokedAt: null },
      include: { user: { select: { status: true } } },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.user.status !== UserStatus.ACTIVE ||
      session.expiresAt <= now ||
      session.authenticatedAt > now
    ) {
      throw new AuthSessionException('AUTH_SESSION_INVALID');
    }

    const lastActivity = session.lastUsedAt ?? session.createdAt;
    const inactivityDeadline = new Date(lastActivity.getTime() + this.inactivityTtlMs(session.authenticationLevel));
    if (inactivityDeadline <= now) throw new AuthSessionException('AUTH_SESSION_INVALID');

    const authenticationLevel = session.authenticationLevel;
    const permissionKeys =
      authenticationLevel === 'STAFF_MFA'
        ? await this.permissions.effectivePermissionKeys(verified.userId, now)
        : new Set<string>();

    return Object.freeze({
      userId: verified.userId,
      sessionId: verified.sessionId,
      tokenId: verified.tokenId,
      authenticationLevel,
      authenticatedAt: session.authenticatedAt,
      accessExpiresAt: new Date(verified.expiresAtSeconds * 1_000),
      permissions: permissionKeys,
    });
  }

  private inactivityTtlMs(level: AuthenticationLevel): number {
    if (level === 'CUSTOMER_OTP') return CUSTOMER_INACTIVITY_TTL_MS;
    if (level === 'STAFF_MFA') return STAFF_INACTIVITY_TTL_MS;
    throw new AuthSessionException('AUTH_SESSION_INVALID');
  }
}