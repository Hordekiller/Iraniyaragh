import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);

const WEB_URL = process.env.WEB_E2E_URL ?? 'http://127.0.0.1:4173';
const REAL_WEB_URL = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174';
const ADMIN_URL = process.env.ADMIN_E2E_URL ?? 'http://127.0.0.1:3001';
const API_URL = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';
// The real nginx vhost, from scripts/nginx-routing-proxy.sh. Routing is the one
// layer no other project here covers, because they all bypass nginx entirely.
const NGINX_URL = process.env.NGINX_E2E_URL ?? `http://127.0.0.1:${process.env.NGINX_E2E_HTTP_PORT ?? 8080}`;

export default defineConfig({
  testDir: './tests',
  // The routing project needs the real nginx in front of everything, and it needs
  // a container whose lifetime is not tied to a webServer process that can be
  // SIGKILLed. See scripts/nginx-routing-proxy.sh for why.
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
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
    {
      // Only one project: routing is not viewport-dependent, and a mobile pass
      // would just re-prove the same redirect table more slowly.
      name: 'nginx-routing',
      testMatch: /nginx-.*\.spec\.ts/,
      // The TLS assertions use the https origin directly with
      // ignoreHTTPSErrors, because the harness serves a throwaway self-signed
      // certificate.
      use: {
        ...devices['Desktop Chrome'],
        baseURL: NGINX_URL,
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @iranyaragh/web exec vite build --mode real-e2e --outDir dist-real && pnpm --filter @iranyaragh/web exec vite preview --outDir dist-real --host 127.0.0.1 --port 4174 --strictPort',
      env: { VITE_FIXTURE_CATALOG: 'false', VITE_FIXTURE_AUTH: 'false', VITE_API_BASE_URL: API_URL },
      url: REAL_WEB_URL,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
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
