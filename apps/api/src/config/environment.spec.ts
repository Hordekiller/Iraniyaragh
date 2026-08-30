import { describe, expect, it } from 'vitest';
import { parseCorsOrigins, validateEnvironment } from './environment';

const validDevelopmentEnvironment = {
  NODE_ENV: 'development',
  API_PORT: '4000',
  DATABASE_URL: 'postgresql://app:app@localhost:5432/iraniyaragh',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGINS: 'http://localhost:5173,http://localhost:3001',
  JWT_ACCESS_SECRET: 'development-access-secret',
  JWT_REFRESH_SECRET: 'development-refresh-secret',
  OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
  OBJECT_STORAGE_ACCESS_KEY: 'minio',
  OBJECT_STORAGE_SECRET_KEY: 'development-object-secret',
  OBJECT_STORAGE_BUCKET: 'products',
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

  it.each(['*', 'example.com', 'https://example.com/path', 'file:///tmp/admin'])('rejects unsafe or invalid origin %s', value => {
    expect(() => parseCorsOrigins(value, 'production')).toThrow();
  });

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

  it.each([
    ['API_PORT', '70000'],
    ['DATABASE_URL', 'mysql://localhost/db'],
    ['REDIS_URL', 'http://localhost:6379'],
    ['OBJECT_STORAGE_ENDPOINT', 'localhost:9000'],
  ])('rejects invalid %s', (key, value) => {
    expect(() => validateEnvironment({ ...validDevelopmentEnvironment, [key]: value })).toThrow();
  });

  it('rejects identical access and refresh secrets', () => {
    expect(() =>
      validateEnvironment({
        ...validDevelopmentEnvironment,
        JWT_REFRESH_SECRET: validDevelopmentEnvironment.JWT_ACCESS_SECRET,
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
      }),
    ).toThrow('JWT_ACCESS_SECRET');
  });

  it('accepts explicit strong production configuration', () => {
    const result = validateEnvironment({
      ...validDevelopmentEnvironment,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://admin.example.com,https://shop.example.com',
      JWT_ACCESS_SECRET: 'access-secret-with-at-least-32-characters',
      JWT_REFRESH_SECRET: 'refresh-secret-with-at-least-32-characters',
      OBJECT_STORAGE_SECRET_KEY: 'object-secret-with-at-least-32-characters',
    });
    expect(result.NODE_ENV).toBe('production');
  });
});
