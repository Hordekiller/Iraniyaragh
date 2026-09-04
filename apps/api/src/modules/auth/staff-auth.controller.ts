import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type {
  AccessTokenResponse,
  AuthenticationLevel,
  AuthPrincipal,
  CurrentPrincipalResponse,
  EmptyResponse,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { AuthSessionService } from './auth-session.service';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { CurrentPrincipal, RequireAuthentication } from './auth.guard';
import { StaffDevSignInDto } from './staff-auth.dto';

const DEV_ADMIN_EMAIL = 'dev-admin@iranyaragh.local';
const STAFF_LEVEL: AuthenticationLevel = 'STAFF_MFA';
const ACCESS_TOKEN_TYPE = 'Bearer';
const ACCESS_TOKEN_TTL_SECONDS = 600;
const DEV_REFRESH_COOKIE = 'iranyaragh_dev_refresh';
const DEV_CSRF_COOKIE = 'iranyaragh_dev_csrf';

@Controller({ path: 'auth', version: '1' })
export class StaffAuthController {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    private readonly hashes: AuthHashService,
    private readonly sessions: AuthSessionService,
    private readonly principals: AuthPrincipalService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('dev/signin')
  async devSignIn(
    @Body() body: StaffDevSignInDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    if (!this.config.devLoginEnabled) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found.' });
    }

    if (!this.devCodesMatch(body.code, this.config.devCode)) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid sign-in code.' });
    }

    const user = await this.prisma.user.findUnique({
      where: { email: DEV_ADMIN_EMAIL },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid sign-in code.' });
    }

    const authenticatedAt = new Date();
    const issued = await this.sessions.createSession({
      userId: user.id,
      authenticationLevel: STAFF_LEVEL,
      authenticatedAt,
      deviceName: body.deviceName,
      ipAddress: typeof request.ip === 'string' && request.ip.length > 0 ? request.ip : undefined,
      userAgent:
        typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'].slice(0, 2048) : undefined,
    });

    this.setAuthCookies(response, issued.refreshToken, issued.csrfToken, issued.expiresAt);

    const principal = await this.principals.resolveBearerToken(`${ACCESS_TOKEN_TYPE} ${issued.accessToken}`);
    return {
      data: {
        accessToken: issued.accessToken,
        tokenType: ACCESS_TOKEN_TYPE,
        expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
        principal: this.toAuthPrincipal(principal),
      },
    };
  }

  @Get('me')
  @RequireAuthentication(STAFF_LEVEL)
  async me(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<CurrentPrincipalResponse> {
    return { data: { principal: this.toAuthPrincipal(principal) } };
  }

  @Post('logout')
  @RequireAuthentication(STAFF_LEVEL)
  async logout(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResponse> {
    await this.sessions.revokeSession(principal.userId, principal.sessionId);
    this.clearAuthCookies(response);
    return { data: {} };
  }

  private devCodesMatch(submitted: string, expected: string): boolean {
    const submittedHash = Buffer.from(this.hashes.hash(submitted, 'otp'), 'utf8');
    const expectedHash = Buffer.from(this.hashes.hash(expected, 'otp'), 'utf8');
    return submittedHash.length === expectedHash.length && timingSafeEqual(submittedHash, expectedHash);
  }

  private toAuthPrincipal(principal: AuthPrincipalContext): AuthPrincipal {
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      authenticationLevel: principal.authenticationLevel,
      permissions: [...principal.permissions],
      authenticatedAt: principal.authenticatedAt.toISOString(),
      accessExpiresAt: principal.accessExpiresAt.toISOString(),
    };
  }

  private setAuthCookies(response: Response, refreshToken: string, csrfToken: string, expiresAt: Date): void {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
    const base = { sameSite: 'strict' as const, path: '/', secure: false, maxAge };
    response.cookie(DEV_REFRESH_COOKIE, refreshToken, { ...base, httpOnly: true });
    response.cookie(DEV_CSRF_COOKIE, csrfToken, { ...base, httpOnly: false });
  }

  private clearAuthCookies(response: Response): void {
    const base = { sameSite: 'strict' as const, path: '/', secure: false, maxAge: 0 };
    response.cookie(DEV_REFRESH_COOKIE, '', { ...base, httpOnly: true });
    response.cookie(DEV_CSRF_COOKIE, '', { ...base, httpOnly: false });
  }
}
