import { defineConfig, devices } from '@playwright/test';

/**
 * Real-stack session verification. Not part of the default smoke suite: it
 * needs a hand-started stack (API + admin built with NEXT_PUBLIC_BASE_PATH=/admin
 * + real storefront) behind ONE nginx origin and a disposable test database.
 * See README.md in this directory.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  outputDir: '../test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.SESSION_E2E_ORIGIN ?? 'http://127.0.0.1:8180',
    trace: 'retain-on-failure',
    // HTTPS runs use a throwaway certificate and a hostname mapped to the local nginx.
    ignoreHTTPSErrors: process.env.SESSION_E2E_PRODUCTION_COOKIES === '1',
    launchOptions: process.env.SESSION_E2E_HOST_RULES ? { args: [`--host-resolver-rules=${process.env.SESSION_E2E_HOST_RULES}`] } : {},
  },
});
