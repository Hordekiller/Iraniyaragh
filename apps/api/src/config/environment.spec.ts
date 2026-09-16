import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, parseTrustProxy, validateEnvironment } from './environment';

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
  PUBLIC_MEDIA_ORIGIN: 'https://media.example.com',
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
  PRODUCT_MEDIA_IMAGE_MAX_BYTES: '20971520',
  PRODUCT_MEDIA_MAX_IMAGE_PIXELS: '40000000',
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

describe('parseTrustProxy', () => {
  it('disables proxy trust when unset or empty', () => {
    expect(parseTrustProxy(undefined)).toEqual({ kind: 'disabled' });
    expect(parseTrustProxy('')).toEqual({ kind: 'disabled' });
    expect(parseTrustProxy('   ')).toEqual({ kind: 'disabled' });
  });

  it('parses an inline hop count', () => {
    expect(parseTrustProxy('1')).toEqual({ kind: 'hops', count: 1 });
    expect(parseTrustProxy('5')).toEqual({ kind: 'hops', count: 5 });
  });

  it.each(['0', '6', '10'])('rejects out-of-contract hop count %s', (value) => {
    expect(() => parseTrustProxy(value)).toThrow('hop count');
  });

  it('parses an explicit subnet allowlist', () => {
    expect(parseTrustProxy('127.0.0.1, 10.0.0.0/8')).toEqual({
      kind: 'subnets',
      subnets: ['127.0.0.1', '10.0.0.0/8'],
    });
  });

  it('parses IPv6 subnets', () => {
    expect(parseTrustProxy('2001:db8::/32')).toEqual({ kind: 'subnets', subnets: ['2001:db8::/32'] });
  });

  it.each([
    'example.com',
    '192.168.1.abc',
    '192.168.1.0/0',
    '10.0.0.0/33',
    '2001:db8::/0',
    '2001:db8::/129',
    '192.168.1.1/',
  ])('rejects unsafe proxy trust value %s', (value) => {
    expect(() => parseTrustProxy(value)).toThrow('TRUST_PROXY');
  });

  it('exposes the parsed value through validateEnvironment', () => {
    const result = validateEnvironment({ ...validDevelopmentEnvironment, TRUST_PROXY: '2' });
    expect(result.TRUST_PROXY).toEqual({ kind: 'hops', count: 2 });
  });

  it('leaves proxy trust disabled when omitted', () => {
    const result = validateEnvironment(validDevelopmentEnvironment);
    expect(result.TRUST_PROXY).toEqual({ kind: 'disabled' });
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
        PRODUCT_MEDIA_IMAGE_MAX_BYTES: validProductionEnvironment.PRODUCT_MEDIA_IMAGE_MAX_BYTES,
        PRODUCT_MEDIA_MAX_IMAGE_PIXELS: validProductionEnvironment.PRODUCT_MEDIA_MAX_IMAGE_PIXELS,
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

  it('uses local S3-compatible defaults and parses explicit path-style configuration', () => {
    const local = validateEnvironment(validDevelopmentEnvironment);
    expect(local.OBJECT_STORAGE_REGION).toBe('us-east-1');
    expect(local.OBJECT_STORAGE_FORCE_PATH_STYLE).toBe(true);
    expect(local.PRODUCT_MEDIA_MAX_ASSETS).toBe(12);
    expect(local.PRODUCT_MEDIA_MAX_VIDEOS).toBe(3);
    expect(local.PRODUCT_MEDIA_UPLOAD_TTL_SECONDS).toBe(900);
    expect(local.PUBLIC_MEDIA_ORIGIN).toBe('https://media.example.com');

    const production = validateEnvironment({
      ...validProductionEnvironment,
      OBJECT_STORAGE_REGION: 'eu-central-1',
      OBJECT_STORAGE_FORCE_PATH_STYLE: 'false',
    });
    expect(production.OBJECT_STORAGE_REGION).toBe('eu-central-1');
    expect(production.OBJECT_STORAGE_FORCE_PATH_STYLE).toBe(false);
  });

  it('requires a controlled HTTPS public media origin in production', () => {
    expect(() => validateEnvironment({ ...validProductionEnvironment, PUBLIC_MEDIA_ORIGIN: undefined })).toThrow('PUBLIC_MEDIA_ORIGIN');
    expect(() => validateEnvironment({ ...validProductionEnvironment, PUBLIC_MEDIA_ORIGIN: 'http://media.example.com' })).toThrow('PUBLIC_MEDIA_ORIGIN');
    expect(() => validateEnvironment({ ...validProductionEnvironment, PUBLIC_MEDIA_ORIGIN: 'https://user:secret@media.example.com' })).toThrow('PUBLIC_MEDIA_ORIGIN');
  });

  it('rejects ambiguous object-storage booleans', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        OBJECT_STORAGE_FORCE_PATH_STYLE: 'yes',
      }),
    ).toThrow('OBJECT_STORAGE_FORCE_PATH_STYLE');
  });

  it.each([
    ['PRODUCT_MEDIA_MAX_ASSETS', '101'],
    ['PRODUCT_MEDIA_MAX_VIDEOS', '21'],
    ['PRODUCT_MEDIA_IMAGE_MAX_BYTES', '101'],
    ['PRODUCT_MEDIA_UPLOAD_TTL_SECONDS', '1801'],
  ])('rejects unsafe media policy setting %s=%s', (key, value) => {
    expect(() => validateEnvironment({ ...validDevelopmentEnvironment, [key]: value })).toThrow(key);
  });
});
