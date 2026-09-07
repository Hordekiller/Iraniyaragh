import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
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
  StaffMfaChallengeResponse,
  StaffRecoveryCodesResponse,
  StaffTotpEnrollmentResponse,
} from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AUTH_RUNTIME_CONFIG, DEV_SIGNIN_COOKIE_SPEC, type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { AuthSessionService } from './auth-session.service';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication } from './auth.guard';
import { StaffDevSignInDto, StaffPasswordChangeDto, StaffPasswordDto, StaffRecoveryVerifyDto, StaffTotpConfirmDto, StaffTotpVerifyDto } from './staff-auth.dto';
import {
  cookieSpecForRequest,
  clearAuthCookies,
  requireCookieProof,
  setAuthCookies,
} from './auth-http';
import { AuthSessionException } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffMfaService } from './staff-mfa.service';

const DEV_ADMIN_EMAIL = 'dev-admin@iranyaragh.local';
const STAFF_LEVEL: AuthenticationLevel = 'STAFF_MFA';
const ACCESS_TOKEN_TYPE = 'Bearer';
const ACCESS_TOKEN_TTL_SECONDS = 600;

@Controller({ path: 'auth', version: '1' })
export class StaffAuthController {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    private readonly hashes: AuthHashService,
    private readonly sessions: AuthSessionService,
    private readonly principals: AuthPrincipalService,
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly staffAuth: StaffAuthService,
    private readonly staffMfa: StaffMfaService,
  ) {}

  @Post('staff/password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async staffPassword(
    @Body() body: StaffPasswordDto,
    @Req() request: Request,
  ): Promise<StaffMfaChallengeResponse> {
    return this.staffAuth.requestPasswordChallenge({
      identifier: body.identifier,
      password: body.password,
      ipAddress: typeof request.ip === 'string' ? request.ip : undefined,
    });
  }

  @Post('staff/totp/verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async staffTotp(
    @Body() body: StaffTotpVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const result = await this.staffMfa.verifyTotp({
      challengeToken: body.challengeToken,
      code: body.code,
      ipAddress: typeof request.ip === 'string' ? request.ip : undefined,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    });
    setAuthCookies(response, this.config.cookies, result.refreshToken, result.csrfToken, result.expiresAt);
    return result.response;
  }

  @Post('staff/recovery/verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async staffRecovery(
    @Body() body: StaffRecoveryVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const result = await this.staffMfa.verifyRecovery({
      challengeToken: body.challengeToken,
      code: body.code,
      ipAddress: typeof request.ip === 'string' ? request.ip : undefined,
      userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
    });
    setAuthCookies(response, this.config.cookies, result.refreshToken, result.csrfToken, result.expiresAt);
    return result.response;
  }

  @Post('staff/totp/enroll')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireFreshAuthentication(STAFF_LEVEL)
  async totpEnroll(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<StaffTotpEnrollmentResponse> {
    return this.staffMfa.beginTotpEnrollment(principal.userId);
  }

  @Post('staff/totp/confirm')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireAuthentication(STAFF_LEVEL)
  async totpConfirm(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() body: StaffTotpConfirmDto,
  ): Promise<StaffRecoveryCodesResponse> {
    return this.staffMfa.confirmTotp(principal.userId, body.code);
  }

  @Post('staff/recovery/regenerate')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireFreshAuthentication(STAFF_LEVEL)
  async recoveryRegenerate(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<StaffRecoveryCodesResponse> {
    return this.staffMfa.regenerateRecoveryCodes(principal.userId, principal.sessionId);
  }

  @Post('staff/password/change')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireFreshAuthentication(STAFF_LEVEL)
  async staffPasswordChange(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() body: StaffPasswordChangeDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResponse> {
    const issued = await this.staffAuth.changePassword({
      userId: principal.userId,
      currentSessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    setAuthCookies(response, this.config.cookies, issued.refreshToken, issued.csrfToken, issued.expiresAt);
    return { data: {} };
  }

  @Post('dev/signin')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
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

    const cookieSpec = this.config.devLoginEnabled
      ? Object.freeze({ ...this.config.cookies, ...DEV_SIGNIN_COOKIE_SPEC })
      : this.config.cookies;
    setAuthCookies(response, cookieSpec, issued.refreshToken, issued.csrfToken, issued.expiresAt);

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
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  @RequireAuthentication(STAFF_LEVEL)
  async me(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<CurrentPrincipalResponse> {
    return { data: { principal: this.toAuthPrincipal(principal) } };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<EmptyResponse> {
    const cookieSpec = cookieSpecForRequest(request, this.config.cookies);
    const refreshToken = requireCookieProof(
      request,
      this.tokens,
      cookieSpec,
      this.config.corsOrigins ?? [],
    );
    await this.sessions.revokeByRefreshToken(refreshToken);
    clearAuthCookies(response, this.config.cookies);
    return { data: {} };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const cookieSpec = cookieSpecForRequest(request, this.config.cookies);
    const refreshToken = requireCookieProof(
      request,
      this.tokens,
      cookieSpec,
      this.config.corsOrigins ?? [],
    );

    try {
      const issued = await this.sessions.rotateSession(refreshToken);
      setAuthCookies(response, cookieSpec, issued.refreshToken, issued.csrfToken, issued.expiresAt);
      const principal = await this.principals.resolveBearerToken(`${ACCESS_TOKEN_TYPE} ${issued.accessToken}`);
      return {
        data: {
          accessToken: issued.accessToken,
          tokenType: ACCESS_TOKEN_TYPE,
          expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
          principal: this.toAuthPrincipal(principal),
        },
      };
    } catch (error) {
      if (error instanceof AuthSessionException) clearAuthCookies(response, this.config.cookies);
      throw error;
    }
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
}
