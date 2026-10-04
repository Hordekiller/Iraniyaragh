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
import { ApiBody, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AccessTokenResponse, CustomerOtpChallengeResponse } from '@iranyaragh/contracts';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth.config';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { AuthSessionService } from './auth-session.service';
import { CustomerOtpRequestDto, CustomerOtpVerifyDto } from './customer-otp.dto';
import { CustomerOtpService } from './customer-otp.service';
import { ExpiredOtpChallengeException, InvalidOtpChallengeException } from './customer-otp.exceptions';
import { setAuthCookies } from './auth-http';

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
  @ApiBody({ schema: { type: 'object', additionalProperties: false, required: ['mobile', 'client'],
    properties: { mobile: { type: 'string', maxLength: 64 }, client: { type: 'string', enum: ['CUSTOMER_WEB'] } } } })
  @ApiResponse({ status: 202, description: 'Active challenge. Delivery acceptance is explicit; unknown results must not be automatically retried.',
    schema: { type: 'object', required: ['data'], properties: { data: { type: 'object',
      required: ['challengeId', 'expiresInSeconds', 'resendAfterSeconds', 'deliveryStatus'], properties: {
        challengeId: { type: 'string' }, expiresInSeconds: { type: 'integer', enum: [300] },
        resendAfterSeconds: { type: 'integer', enum: [60] }, deliveryStatus: { type: 'string', enum: ['accepted', 'unknown_result'] },
      } } } } })
  @ApiResponse({ status: 429, description: 'Existing destination/IP policies or explicit provider throttling; Retry-After header.' })
  @ApiResponse({ status: 503, description: 'SMS_PROVIDER_DISABLED or UPSTREAM_UNAVAILABLE; no successful delivery is claimed.' })
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
  @HttpCode(HttpStatus.OK)
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

    setAuthCookies(response, this.config.cookies, issued.refreshToken, issued.csrfToken, issued.expiresAt);

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

}
