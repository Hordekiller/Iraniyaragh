import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { createAuthRuntimeConfig } from './auth.config';

type EnvRecord = Record<string, unknown>;

function fakeConfigService(values: EnvRecord): ConfigService<EnvironmentVariables, true> {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`missing ${key}`);
      return values[key];
    },
  } as unknown as ConfigService<EnvironmentVariables, true>;
}

const baseEnv: EnvRecord = {
  NODE_ENV: 'development',
  CORS_ORIGINS: 'http://localhost:3001',
  JWT_ACCESS_SECRET: 'access-secret-at-least-thirty-two-bytes',
  AUTH_JWT_ISSUER: 'iranyaragh-test',
  AUTH_HASH_KEY_VERSION: 1,
  AUTH_HASH_SECRET: 'hash-secret-at-least-thirty-two-bytes',
};

describe('createAuthRuntimeConfig', () => {
  it('exposes no development sign-in surface at all', () => {
    const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv }));
    expect(Object.keys(config).sort()).toEqual([
      'accessSigningSecret',
      'accessTokenTtlSeconds',
      'audience',
      'clockToleranceSeconds',
      'cookies',
      'corsOrigins',
      'currentHashKey',
      'issuer',
      'previousHashKey',
      'staffCookies',
      'totpEncryptionKey',
    ]);
  });
});


describe('auth cookie realms', () => {
  it('gives staff and customer sessions disjoint refresh and CSRF cookie names', () => {
    for (const NODE_ENV of ['development', 'production'] as const) {
      const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv, NODE_ENV }));
      const names = [config.cookies.refreshName, config.cookies.csrfName, config.staffCookies?.refreshName, config.staffCookies?.csrfName];
      expect(new Set(names).size).toBe(4);
      expect(config.staffCookies?.secure).toBe(config.cookies.secure);
    }
  });
});
