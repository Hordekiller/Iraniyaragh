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
  JWT_ACCESS_SECRET: 'access-secret-at-least-thirty-two-bytes',
  AUTH_JWT_ISSUER: 'iranyaragh-test',
  AUTH_HASH_KEY_VERSION: 1,
  AUTH_HASH_SECRET: 'hash-secret-at-least-thirty-two-bytes',
};

describe('createAuthRuntimeConfig', () => {
  it('disables dev login when AUTH_DEV_CODE is absent', () => {
    const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv }));
    expect(config.devLoginEnabled).toBe(false);
    expect(config.devCode).toBe('');
  });

  it('enables dev login in development when AUTH_DEV_CODE is set', () => {
    const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv, AUTH_DEV_CODE: 'dev-code' }));
    expect(config.devLoginEnabled).toBe(true);
    expect(config.devCode).toBe('dev-code');
  });

  it('enables dev login in test when AUTH_DEV_CODE is set', () => {
    const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv, NODE_ENV: 'test', AUTH_DEV_CODE: 'x' }));
    expect(config.devLoginEnabled).toBe(true);
  });

  it('fails startup when AUTH_DEV_CODE is set outside development/test', () => {
    for (const environment of ['staging', 'production']) {
      expect(() =>
        createAuthRuntimeConfig(fakeConfigService({ ...baseEnv, NODE_ENV: environment, AUTH_DEV_CODE: 'x' })),
      ).toThrow(/only permitted in development and test/);
    }
  });

  it('rejects an empty AUTH_DEV_CODE (treated as absent, not enabled)', () => {
    const config = createAuthRuntimeConfig(fakeConfigService({ ...baseEnv, AUTH_DEV_CODE: '' }));
    expect(config.devLoginEnabled).toBe(false);
  });
});
