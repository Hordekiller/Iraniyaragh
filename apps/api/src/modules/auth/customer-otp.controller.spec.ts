import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import type { AuthRuntimeConfig } from './auth.config';
import type { AuthPrincipalContext, AuthPrincipalService } from './auth-principal.service';
import type { AuthSessionService } from './auth-session.service';
import { CustomerAuthController } from './customer-otp.controller';
import type { CustomerOtpService, OtpVerifyResult } from './customer-otp.service';
import { ExpiredOtpChallengeException, InvalidOtpChallengeException } from './customer-otp.exceptions';

const principal: AuthPrincipalContext = Object.freeze({
  userId: 'user-customer-1',
  sessionId: 'session-customer-1',
  tokenId: 'jti-customer-1',
  authenticationLevel: 'CUSTOMER_OTP',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set<string>(),
});

function createController(overrides: Partial<{
  otp: Pick<CustomerOtpService, 'requestOtp' | 'verifyOtp' | 'resetIpVerificationFailures'>;
  sessions: Pick<AuthSessionService, 'createSession'>;
  principals: Pick<AuthPrincipalService, 'resolveBearerToken'>;
  cookies: AuthRuntimeConfig['cookies'];
}> = {}): CustomerAuthController {
  const defaults: Pick<CustomerOtpService, 'requestOtp' | 'verifyOtp' | 'resetIpVerificationFailures'> = {
    requestOtp: vi.fn(async () => ({
      challengeId: 'challenge-1',
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
    })),
    verifyOtp: vi.fn(async (): Promise<OtpVerifyResult> => ({
      challenge: { kind: 'success', userId: 'user-customer-1', deviceName: 'Test device' },
    })),
    resetIpVerificationFailures: vi.fn(async () => undefined),
  };
  const otp = { ...defaults, ...overrides.otp };
  const sessions: Pick<AuthSessionService, 'createSession'> = overrides.sessions ?? {
    createSession: vi.fn(async () => ({
      accessToken: 'at-customer-1',
      csrfToken: 'csrf-customer-1',
      expiresAt: new Date(Date.now() + 600_000),
      refreshToken: 'rt-customer-1',
      sessionId: 'session-customer-1',
      tokenFamilyId: 'tf-customer-1',
    })),
  };
  const principals: Pick<AuthPrincipalService, 'resolveBearerToken'> = overrides.principals ?? {
    resolveBearerToken: vi.fn(async () => principal),
  };
  const config: AuthRuntimeConfig = Object.freeze({
    accessSigningSecret: 'x',
    issuer: 'iranyaragh-test',
    audience: 'iranyaragh-browser',
    accessTokenTtlSeconds: 600,
    clockToleranceSeconds: 30,
    currentHashKey: Object.freeze({ version: 1, secret: 'secret'.repeat(8) }),
    devLoginEnabled: false,
    devCode: '',
    cookies: overrides.cookies ?? {
      refreshName: 'iranyaragh_dev_refresh',
      csrfName: 'iranyaragh_dev_csrf',
      secure: false,
      sameSite: 'strict',
      path: '/',
    },
  });
  return new CustomerAuthController(
    config,
    otp as CustomerOtpService,
    sessions as AuthSessionService,
    principals as AuthPrincipalService,
  );
}

function mockResponse() {
  const calls: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const cookie = vi.fn((name: string, value: string, options: Record<string, unknown>) => {
    calls.push({ name, value, options });
  });
  return { cookie, calls } as unknown as Response & {
    calls: Array<{ name: string; value: string; options: Record<string, unknown> }>;
  };
}

function mockRequest(ip?: string) {
  return { ip, headers: {} } as unknown as Request;
}

describe('CustomerAuthController (customer OTP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests an OTP and returns the 202 challenge shape', async () => {
    const controller = createController();
    const result = await controller.requestOtp(
      { mobile: '+989123456789', client: 'CUSTOMER_WEB' },
      mockRequest('192.0.2.10'),
    );

    expect(result).toEqual({
      data: { challengeId: 'challenge-1', expiresInSeconds: 300, resendAfterSeconds: 60 },
    });
  });

  it('issues a session, sets env-aware httpOnly refresh + CSRF cookies, and returns the principal', async () => {
    const controller = createController();
    const response = mockResponse();
    const result = await controller.verifyOtp(
      { challengeId: 'challenge-1', code: '123456', deviceName: 'Test device' },
      mockRequest('192.0.2.10'),
      response,
    );

    expect(result.data.accessToken).toBe('at-customer-1');
    expect(result.data.tokenType).toBe('Bearer');
    expect(result.data.expiresInSeconds).toBe(600);
    expect(result.data.principal.authenticationLevel).toBe('CUSTOMER_OTP');

    const cookieNames = response.calls.map(call => call.name);
    expect(cookieNames).toEqual(['iranyaragh_dev_refresh', 'iranyaragh_dev_csrf']);
    expect(response.calls[0]).toMatchObject({
      name: 'iranyaragh_dev_refresh',
      options: { httpOnly: true, secure: false, sameSite: 'strict', path: '/' },
    });
    expect(response.calls[1]).toMatchObject({
      name: 'iranyaragh_dev_csrf',
      options: { httpOnly: false },
    });
  });

  it('uses secure __Host- cookie names and attributes in production cookie mode', async () => {
    const controller = createController({
      cookies: {
        refreshName: '__Host-iranyaragh_refresh',
        csrfName: '__Host-iranyaragh_csrf',
        secure: true,
        sameSite: 'strict',
        path: '/',
      },
    });
    const response = mockResponse();
    await controller.verifyOtp(
      { challengeId: 'challenge-1', code: '123456' },
      mockRequest('192.0.2.10'),
      response,
    );

    const names = response.calls.map(call => call.name);
    expect(names).toEqual(['__Host-iranyaragh_refresh', '__Host-iranyaragh_csrf']);
    expect(response.calls[0]).toMatchObject({
      name: '__Host-iranyaragh_refresh',
      options: { httpOnly: true, secure: true },
    });
  });

  it('rejects an invalid challenge with AUTH_CHALLENGE_INVALID and never sets cookies', async () => {
    const verifyOtp = vi.fn(async (): Promise<OtpVerifyResult> => ({ challenge: { kind: 'invalid' } }));
    const controller = createController({ otp: { verifyOtp } });
    const response = mockResponse();

    await expect(
      controller.verifyOtp({ challengeId: 'challenge-gone', code: '999999' }, mockRequest('192.0.2.10'), response),
    ).rejects.toBeInstanceOf(InvalidOtpChallengeException);
    expect(response.calls.length).toBe(0);
  });

  it('rejects an expired challenge with AUTH_CHALLENGE_EXPIRED', async () => {
    const verifyOtp = vi.fn(async (): Promise<OtpVerifyResult> => ({ challenge: { kind: 'expired' } }));
    const controller = createController({ otp: { verifyOtp } });

    await expect(
      controller.verifyOtp({ challengeId: 'challenge-old', code: '123456' }, mockRequest('192.0.2.10'), mockResponse()),
    ).rejects.toBeInstanceOf(ExpiredOtpChallengeException);
  });

  it('passes the safe request IP to the OTP service', async () => {
    const requestOtp = vi.fn();
    const controller = createController({ otp: { requestOtp } });

    await controller.requestOtp(
      { mobile: '+989123456789', client: 'CUSTOMER_WEB' },
      mockRequest('192.0.2.10'),
    );
    expect(requestOtp).toHaveBeenCalledWith(
      { mobile: '+989123456789', client: 'CUSTOMER_WEB' },
      '192.0.2.10',
    );
  });

  it('passes undefined as the IP when the request provides none (service applies the safe fallback)', async () => {
    const verifyOtp = vi.fn(async () => ({ challenge: { kind: 'success', userId: 'user' } } as OtpVerifyResult));
    const controller = createController({ otp: { verifyOtp } });

    await controller.verifyOtp({ challengeId: 'challenge-1', code: '123456' }, mockRequest(undefined), mockResponse());
    expect(verifyOtp).toHaveBeenCalledWith(expect.any(Object), undefined);
  });
});