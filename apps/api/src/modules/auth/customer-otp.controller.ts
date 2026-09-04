import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AccessTokenResponse, CustomerOtpChallengeResponse } from '@iranyaragh/contracts';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { AuthSessionService } from './auth-session.service';
import { CustomerOtpRequestDto, CustomerOtpVerifyDto } from './customer-otp.dto';
import { CustomerOtpService } from './customer-otp.service';
import { ExpiredOtpChallengeException, InvalidOtpChallengeException } from './customer-otp.exceptions';

const ACCESS_TOKEN_TYPE = 'Bearer';
const ACCESS_TOKEN_TTL_SECONDS = 600;
const AUTHENTICATION_LEVEL = 'CUSTOMER_OTP';

@Controller({ path: 'auth/customer', version: '1' })
export class CustomerAuthController {
  constructor(
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    private readonly otp: CustomerOtpService,
    private readonly sessions: AuthSessionService,
    private readonly principals: AuthPrincipalService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async requestOtp(
    @Body() body: CustomerOtpRequestDto,
    @Req() request: Request,
  ): Promise<CustomerOtpChallengeResponse> {
    const ip = this.requestIp(request);
    const issued = await this.otp.requestOtp(body, ip);
    return { data: issued };
  }

  @Post('otp/verify')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async verifyOtp(
    @Body() body: CustomerOtpVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccessTokenResponse> {
    const ip = this.requestIp(request);
    const result = await this.otp.verifyOtp(body, ip);

    if (result.challenge.kind === 'invalid') {
      throw new InvalidOtpChallengeException();
    }
    if (result.challenge.kind === 'expired') {
      throw new ExpiredOtpChallengeException();
    }

    await this.otp.resetIpVerificationFailures(ip);

    const authenticatedAt = new Date();
    const issued = await this.sessions.createSession({
      userId: result.challenge.userId,
      authenticationLevel: AUTHENTICATION_LEVEL,
      authenticatedAt,
      deviceName: result.challenge.deviceName,
      ipAddress: ip,
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

  private toAuthPrincipal(principal: AuthPrincipalContext) {
    return {
      userId: principal.userId,
      sessionId: principal.sessionId,
      authenticationLevel: principal.authenticationLevel,
      permissions: [...principal.permissions],
      authenticatedAt: principal.authenticatedAt.toISOString(),
      accessExpiresAt: principal.accessExpiresAt.toISOString(),
    };
  }

  private requestIp(request: Request): string | undefined {
    return typeof request.ip === 'string' && request.ip.trim() !== '' ? request.ip : undefined;
  }

  private setAuthCookies(response: Response, refreshToken: string, csrfToken: string, expiresAt: Date): void {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
    const { refreshName, csrfName, secure, sameSite, path } = this.config.cookies;
    const base = { sameSite, path, secure, maxAge };
    response.cookie(refreshName, refreshToken, { ...base, httpOnly: true });
    response.cookie(csrfName, csrfToken, { ...base, httpOnly: false });
  }
}