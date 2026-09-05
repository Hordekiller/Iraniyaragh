import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';

export const AUTH_RUNTIME_CONFIG = Symbol('AUTH_RUNTIME_CONFIG');

export const AUTH_ACCESS_TOKEN_TTL_SECONDS = 600;
export const AUTH_CLOCK_TOLERANCE_SECONDS = 30;
export const AUTH_BROWSER_AUDIENCE = 'iranyaragh-browser';
export const AUTH_ACCESS_TOKEN_TYPE = 'at+jwt';

export type AuthHashKey = Readonly<{
  version: number;
  secret: string;
}>;

export type AuthCookieSpec = Readonly<{
  refreshName: string;
  csrfName: string;
  secure: boolean;
  sameSite: 'strict';
  path: '/';
}>;

const PRODUCTION_COOKIES: AuthCookieSpec = Object.freeze({
  refreshName: '__Host-iranyaragh_refresh',
  csrfName: '__Host-iranyaragh_csrf',
  secure: true,
  sameSite: 'strict',
  path: '/',
});

const DEVELOPMENT_COOKIES: AuthCookieSpec = Object.freeze({
  refreshName: 'iranyaragh_customer_refresh',
  csrfName: 'iranyaragh_customer_csrf',
  secure: false,
  sameSite: 'strict',
  path: '/',
});

export type AuthRuntimeConfig = Readonly<{
  accessSigningSecret: string;
  issuer: string;
  audience: typeof AUTH_BROWSER_AUDIENCE;
  accessTokenTtlSeconds: typeof AUTH_ACCESS_TOKEN_TTL_SECONDS;
  clockToleranceSeconds: typeof AUTH_CLOCK_TOLERANCE_SECONDS;
  currentHashKey: AuthHashKey;
  previousHashKey?: AuthHashKey;
  devLoginEnabled: boolean;
  devCode: string;
  cookies: AuthCookieSpec;
}>;

function cookieSpecFor(environment: 'development' | 'test' | 'staging' | 'production'): AuthCookieSpec {
  if (environment === 'staging' || environment === 'production') return PRODUCTION_COOKIES;
  return DEVELOPMENT_COOKIES;
}

export function createAuthRuntimeConfig(config: ConfigService<EnvironmentVariables, true>): AuthRuntimeConfig {
  const previousVersion = config.get('AUTH_HASH_PREVIOUS_KEY_VERSION', {
    infer: true,
  });
  const previousSecret = config.get('AUTH_HASH_PREVIOUS_SECRET', {
    infer: true,
  });

  if ((previousVersion === undefined) !== (previousSecret === undefined)) {
    throw new Error('Previous Auth hash key configuration is incomplete.');
  }

  const devCode = config.get('AUTH_DEV_CODE', { infer: true }) as string | undefined;
  const environment = config.getOrThrow('NODE_ENV', { infer: true });
  const hasDevCode = typeof devCode === 'string' && devCode.length > 0;
  if (hasDevCode && environment !== 'development' && environment !== 'test') {
    throw new Error('AUTH_DEV_CODE is only permitted in development and test environments.');
  }

  return Object.freeze({
    accessSigningSecret: config.getOrThrow('JWT_ACCESS_SECRET', {
      infer: true,
    }),
    issuer: config.getOrThrow('AUTH_JWT_ISSUER', { infer: true }),
    audience: AUTH_BROWSER_AUDIENCE,
    accessTokenTtlSeconds: AUTH_ACCESS_TOKEN_TTL_SECONDS,
    clockToleranceSeconds: AUTH_CLOCK_TOLERANCE_SECONDS,
    currentHashKey: Object.freeze({
      version: config.getOrThrow('AUTH_HASH_KEY_VERSION', { infer: true }),
      secret: config.getOrThrow('AUTH_HASH_SECRET', { infer: true }),
    }),
    previousHashKey:
      previousVersion === undefined || previousSecret === undefined
        ? undefined
        : Object.freeze({ version: previousVersion, secret: previousSecret }),
    devLoginEnabled: hasDevCode,
    devCode: hasDevCode ? (devCode as string) : '',
    cookies: cookieSpecFor(environment),
  });
}
