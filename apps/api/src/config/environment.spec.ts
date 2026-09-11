import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, validateEnvironment } from './environment';

const validDevelopmentEnvironment = {
  NODE_ENV: 'development',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/iraniyaragh',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:3001',
  AUTH_JWT_ISSUER: 'iranyaragh-api-test',
  JWT_ACCESS_SECRET: 'development-access-secret-0123456789',
  AUTH_HASH_KEY_VERSION: '7',
  AUTH_HASH_SECRET: 'development-hash-root-secret-0123456789',
  AUTH_TOTP_ENCRYPTION_KEY: 'development-totp-encryption-key-0123456789',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_ACCESS_KEY: 'minio',
  OBJECT_STORAGE_SECRET_KEY: 'development-object-secret',
  OBJECT_STORAGE_BUCKET: 'products',
};

const validProductionEnvironment = {
  ...validDevelopmentEnvironment,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://admin.example.com,https://shop.example.com',
  JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
  AUTH_HASH_SECRET: 'hash-secret-with-at-least-32-characters',
  OBJECT_STORAGE_SECRET_KEY: 'object-secret-with-at-least-32-characters',
  SMS_IR_API_KEY: 'production-sms-ir-api-key',
  SMS_IR_OTP_TEMPLATE_ID: '123456',
  SMS_IR_TIMEOUT_MS: '5000',
};

describe('parseCorsOrigins', () => {
  it('uses only known local origins by default in development', () => {
    expect(parseCorsOrigins(undefined, 'development')).toEqual(['http://localhost:5173', 'http://localhost:3001']);
  });

  it('normalizes whitespace and removes duplicate origins', () => {
    expect(parseCorsOrigins('https://admin.example.com, https://admin.example.com', 'production')).toEqual([
      'https://admin.example.com',
    ]);
  });

  it.each(['*', 'example.com', 'https://example.com/path', 'file:///tmp/admin'])(
    'rejects unsafe or invalid origin %s',
    (value) => {
      expect(() => parseCorsOrigins(value, 'production')).toThrow();
    },
  );

  it('requires an explicit allowlist in production', () => {
    expect(() => parseCorsOrigins(undefined, 'production')).toThrow('CORS_ORIGINS is required');
  });
});

describe('validateEnvironment', () => {
  it('parses and returns typed development configuration', () => {
    const result = validateEnvironment(validDevelopmentEnvironment);
    expect(result.API_PORT).toBe(4000);
    expect(result.NODE_ENV).toBe('development');
    expect(result.CORS_ORIGINS).toBe('http://localhost:5173,http://localhost:3001');
  });

  it('parses and returns an optional AUTH_DEV_CODE when provided', () => {
    const result = validateEnvironment({
      ...validDevelopmentEnvironment,
      AUTH_DEV_CODE: 'dev-signin-code',
    });
    expect(result.AUTH_DEV_CODE).toBe('dev-signin-code');
  });

  it('leaves AUTH_DEV_CODE undefined when omitted', () => {
    const result = validateEnvironment(validDevelopmentEnvironment);
    expect(result.AUTH_DEV_CODE).toBeUndefined();
  });

  it('rejects surrounding whitespace in AUTH_DEV_CODE', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        AUTH_DEV_CODE: '  dev-signin-code  ',
      }),
    ).toThrow();
  });

  it.each([
    ['API_PORT', '70000'],
    ['DATABASE_URL', 'mysql://localhost/db'],
    ['REDIS_URL', 'http://localhost:6379'],
    ['OBJECT_STORAGE_ENDPOINT', 'localhost:9000'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validateEnvironment({ ...validDevelopmentEnvironment, [key]: value })).toThrow();
  });

  it('rejects short Auth secrets in every environment', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        JWT_ACCESS_SECRET: 'too-short',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('rejects surrounding whitespace instead of silently changing Auth key material', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        AUTH_HASH_SECRET: ` ${validDevelopmentEnvironment.AUTH_HASH_SECRET}`,
      }),
    ).toThrow('surrounding whitespace');
  });

  it('rejects identical access and hashing secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        JWT_ACCESS_SECRET: 'development-access-secret-0123456789',
        AUTH_HASH_SECRET: 'development-access-secret-0123456789',
      }),
    ).toThrow('must be different');
  });

  it('rejects placeholder or short production secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.example.com',
        JWT_ACCESS_SECRET: 'change-me-access',
        AUTH_HASH_SECRET: 'hash-secret-with-at-least-32-characters',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('requires an explicit API port in staging and production', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        NODE_ENV: 'production',
        API_PORT: undefined,
        CORS_ORIGINS: 'https://admin.example.com',
        JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
        AUTH_HASH_SECRET: 'hash-secret-with-at-least-32-characters',
        OBJECT_STORAGE_SECRET_KEY: 'object-secret-with-at-least-32-characters',
        SMS_IR_API_KEY: validProductionEnvironment.SMS_IR_API_KEY,
        SMS_IR_OTP_TEMPLATE_ID: validProductionEnvironment.SMS_IR_OTP_TEMPLATE_ID,
      }),
    ).toThrow('API_PORT is required');
  });

  it('requires an explicit Auth hash key version in staging and production', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://admin.example.com',
        AUTH_HASH_KEY_VERSION: undefined,
        JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
        AUTH_HASH_SECRET: 'hash-secret-with-at-least-32-characters',
        OBJECT_STORAGE_SECRET_KEY: 'object-secret-with-at-least-32-characters',
      }),
    ).toThrow('AUTH_HASH_KEY_VERSION');
  });

  it('rejects placeholder or short staging secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        NODE_ENV: 'staging',
        CORS_ORIGINS: 'https://staging-admin.example.com',
        JWT_ACCESS_SECRET: 'change-me-access',
        AUTH_HASH_SECRET: 'hash-secret-with-at-least-32-characters',
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('accepts explicit strong production configuration', () => {
    const result = validateEnvironment(validProductionEnvironment);
    expect(result.NODE_ENV).toBe('production');
    expect(result.SMS_IR_OTP_TEMPLATE_ID).toBe(123456);
    expect(result.SMS_IR_TIMEOUT_MS).toBe(5000);
  });

  it.each(['SMS_IR_API_KEY', 'SMS_IR_OTP_TEMPLATE_ID'])('requires %s outside local environments', (key) => {
    expect(() =>
      validateEnvironment({
        ...validProductionEnvironment,
        [key]: undefined,
      }),
    ).toThrow(key);
  });

  it.each([
    ['SMS_IR_OTP_TEMPLATE_ID', '0'],
    ['SMS_IR_OTP_TEMPLATE_ID', '10000000000'],
    ['SMS_IR_TIMEOUT_MS', '499'],
    ['SMS_IR_TIMEOUT_MS', '10001'],
    ['SMS_IR_TIMEOUT_MS', '1.5'],
  ])('rejects out-of-contract %s=%s', (key, value) => {
    expect(() => validateEnvironment({ ...validProductionEnvironment, [key]: value })).toThrow(key);
  });

  it.each([' padded-key', 'padded-key ', 'key with space', 'key\nwith-control'])(
    'rejects SMS API key whitespace/control characters without normalization: %s',
    (apiKey) => {
      expect(() =>
        validateEnvironment({
          ...validProductionEnvironment,
          SMS_IR_API_KEY: apiKey,
        }),
      ).toThrow('SMS_IR_API_KEY');
    },
  );

  it('keeps SMS.ir optional in development where the deterministic fake is used', () => {
    const result = validateEnvironment(validDevelopmentEnvironment);
    expect(result.SMS_IR_API_KEY).toBeUndefined();
    expect(result.SMS_IR_OTP_TEMPLATE_ID).toBeUndefined();
  });

  it('accepts a distinct current and previous Auth hashing key pair', () => {
    const result = validateEnvironment({
      ...validDevelopmentEnvironment,
      JWT_ACCESS_SECRET: 'development-access-secret-0123456789',
      AUTH_HASH_SECRET: 'development-current-hash-secret-012345',
      AUTH_HASH_KEY_VERSION: '8',
      AUTH_HASH_PREVIOUS_SECRET: 'development-previous-hash-secret-01234',
      AUTH_HASH_PREVIOUS_KEY_VERSION: '7',
    });

    expect(result.AUTH_HASH_KEY_VERSION).toBe(8);
    expect(result.AUTH_HASH_PREVIOUS_KEY_VERSION).toBe(7);
  });

  it('rejects incomplete or duplicate Auth hashing rotation keys', () => {
    const strongBase = {
      ...validDevelopmentEnvironment,
      JWT_ACCESS_SECRET: 'development-access-secret-0123456789',
      AUTH_HASH_SECRET: 'development-current-hash-secret-012345',
    };

    expect(() =>
      validateEnvironment({
        ...strongBase,
        AUTH_HASH_PREVIOUS_KEY_VERSION: '6',
      }),
    ).toThrow('must be configured together');
    expect(() =>
      validateEnvironment({
        ...strongBase,
        AUTH_HASH_PREVIOUS_KEY_VERSION: '7',
        AUTH_HASH_PREVIOUS_SECRET: strongBase.AUTH_HASH_SECRET,
      }),
    ).toThrow('distinct versions and secrets');
  });
});
