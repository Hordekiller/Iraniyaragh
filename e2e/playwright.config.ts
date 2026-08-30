import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

const WEB_URL = process.env.WEB_E2E_URL ?? 'http://127.0.0.1:4173';
const ADMIN_URL = process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 1 : undefined,
  timeout: 30_000,
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