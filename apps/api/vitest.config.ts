import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    env: {
      NODE_ENV: 'test',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://app:app@localhost:55434/app',
      REDIS_URL: 'redis://localhost:6379',
      CORS_ORIGINS: 'http://localhost:5173',
      AUTH_JWT_ISSUER: 'iranyaragh-api-test',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef',
      AUTH_HASH_KEY_VERSION: '7',
      AUTH_HASH_SECRET: 'test-hash-root-secret-0123456789abcdef',
      OBJECT_STORAGE_ENDPOINT: 'https://object-storage.example.com',
      OBJECT_STORAGE_ACCESS_KEY: 'test-access-key',
      OBJECT_STORAGE_SECRET_KEY: 'test-object-secret-key-0123456789abcdefgh',
      OBJECT_STORAGE_BUCKET: 'test-assets',
    },
  },
});
