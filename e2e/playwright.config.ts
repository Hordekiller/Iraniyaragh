import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

const WEB_URL = process.env.WEB_E2E_URL ?? 'http://127.0.0.1:4173';
const ADMIN_URL = process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3001';
const API_URL = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  // Always one worker, locally and in CI. Every browser suite signs in as the same
  // real staff identity, and a password challenge invalidates the previous one,
  // so two sign-ins in parallel would leave the slower test with a dead
  // challenge. Serialising the suite is what lets the tests exercise the real
  // single-active-challenge security contract instead of weakening it.
  workers: 1,
  // A real sign-in spends up to one TOTP step (30s) waiting for an unused code
  // window, so the per-test budget cannot stay at the interaction-level default.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'web-desktop',
      testMatch: /web-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'web-mobile',
      testMatch: /web-.*\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: WEB_URL },
    },
    {
      name: 'admin-desktop',
      testMatch: /admin-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: ADMIN_URL, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'admin-mobile',
      testMatch: /admin-.*\.spec\.ts/,
      use: { ...devices['Pixel 7'], baseURL: ADMIN_URL },
    },
    {
      name: 'api-http',
      testMatch: /api-.*\.spec\.ts/,
      use: { baseURL: API_URL },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @iranyaragh/web preview --host 127.0.0.1 --port 4173 --strictPort',
      url: WEB_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @iranyaragh/admin start --hostname 127.0.0.1',
      url: ADMIN_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
  ],
});