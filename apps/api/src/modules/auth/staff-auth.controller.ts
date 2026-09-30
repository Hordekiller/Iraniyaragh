import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';
import { AuthSessionService } from './auth-session.service';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication } from './auth.guard';
import { StaffPasswordChangeDto, StaffPasswordDto, StaffRecoveryVerifyDto, StaffTotpConfirmDto, StaffTotpVerifyDto } from './staff-auth.dto';
import { clearAuthCookies, requireCookieProof, setAuthCookies } from './auth-http';
import { AuthSessionException } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { StaffAuthService } from './staff-auth.service';
import { StaffMfaService } from './staff-mfa.service';
import { RateLimitService } from './rate-limit.service';

const STAFF_LEVEL: AuthenticationLevel = 'STAFF_MFA';
const ACCESS_TOKEN_TYPE = 'Bearer';
const ACCESS_TOKEN_TTL_SECONDS = 600;

@Controller({ path: 'auth', version: '1' })
export class StaffAuthController {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    private readonly sessions: AuthSessionService,
    private readonly principals: AuthPrincipalService,
    private readonly tokens: AuthTokenService,
    private readonly staffAuth: StaffAuthService,
    private readonly staffMfa: StaffMfaService,
    private readonly limits: RateLimitService,
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
    const issued = await this.staffAuth.updateCredentialAndRotateSession({
      userId: principal.userId,
      currentSessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });
    setAuthCookies(response, this.config.cookies, issued.refreshToken, issued.csrfToken, issued.expiresAt);
    return { data: {} };
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
    const cookieSpec = this.config.cookies;
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
    const refreshIp = this.requestIp(request);
    if (refreshIp !== undefined) {
      await this.limits.enforce({ dimension: 'refresh:ip', value: refreshIp, context: 'ip' });
    }
    const cookieSpec = this.config.cookies;
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

  private requestIp(request: Request): string | undefined {
    return typeof request.ip === 'string' && request.ip.trim() !== '' ? request.ip : undefined;
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
