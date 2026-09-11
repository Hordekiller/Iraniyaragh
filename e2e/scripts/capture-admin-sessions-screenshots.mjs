#!/usr/bin/env node
/**
 * Captures desktop + mobile screenshots of the admin session/device-management
 * page for the #50 acceptance evidence ("desktop/mobile screenshots companion
 * to the PR").
 *
 * It drives the fixture-backed staff sign-in (/login/staff, deterministic
 * password + TOTP) in a NEXT_PUBLIC_FIXTURE_AUTH + NEXT_PUBLIC_SESSION_FIXTURE
 * dev build, so the shots are deterministic and need no API, SMS provider or
 * live session:
 *
 *   01 session list    02 single-device revoke dialog    03 logout-all dialog
 *
 * Setup: the script starts the admin dev server itself if nothing is already
 * listening on the admin port, so run it from the repo root (no prior build):
 *
 *   pnpm --filter @iranyaragh/e2e screenshots:admin-sessions
 *
 * Output: docs/screenshots/admin-sessions/<viewport>-<state>.png
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adminPort = Number(process.env.ADMIN_E2E_PORT ?? 3001);
const baseURL = process.env.ADMIN_E2E_URL ?? `http://127.0.0.1:${adminPort}`;
const outputDir = './docs/screenshots/admin-sessions';

const STAFF_IDENTIFIER = 'ops@iranyaragh.local';
const STAFF_PASSWORD = 'FixtuRe-E2E-Admin!2026';
const STAFF_TOTP = '654321';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', ...devices['Pixel 7'] },
];

async function up(url) {
  try {
    const response = await fetch(url, { method: 'GET' });
    return response.ok ? response.status : null;
  } catch {
    return null;
  }
}

/**
 * Mirrors the e2e `tap()` helper: a synthetic click. Chromium's hit-target math
 * mis-handles RTL pages on mobile emulation (negative scrollLeft), so native
 * clicks land outside the visual viewport; the React handlers are DOM-event
 * driven (including Next.js Link), so a dispatched click exercises the real
 * behavior.
 */
async function tap(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.dispatchEvent('click');
}

function startDevServer() {
  // Fixture mode requires NODE_ENV=development (see session-guard.ts: it fails
  // closed on production builds), so this starts the admin dev server rather
  // than a production `start`.
  console.log(`\n[shots] no server on ${baseURL}; starting fixture admin dev server…`);
  const child = spawn(
    'pnpm',
    ['--filter', '@iranyaragh/admin', 'dev'],
    {
      cwd: repoRoot,
      stdio: 'ignore',
      env: {
        ...process.env,
        NEXT_PUBLIC_FIXTURE_AUTH: 'true',
        NEXT_PUBLIC_SESSION_FIXTURE: 'true',
      },
    },
  );
  return child;
}

/** Deterministic fixture staff sign-in (AUTH_CONTRACT staff model, #50). */
async function signInAsFixtureStaff(page) {
  await page.goto(`${baseURL}/login/staff`, { timeout: 120_000 });
  await page.getByRole('heading', { name: 'ورود کارکنان' }).waitFor({ state: 'visible', timeout: 120_000 });

  await page.getByRole('textbox', { name: 'شناسه کارکن' }).fill(STAFF_IDENTIFIER);
  await page.getByRole('textbox', { name: 'رمز عبور' }).fill(STAFF_PASSWORD);
  // Submit buttons trigger the form's onSubmit; default navigation/submission
  // needs a trusted click, so dispatchEvent is not used here.
  await page.getByRole('button', { name: 'ادامه' }).click();

  await page.getByRole('textbox', { name: 'کد تایید شش‌رقمی' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('textbox', { name: 'کد تایید شش‌رقمی' }).fill(STAFF_TOTP);
  await page.getByRole('button', { name: 'ورود' }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

async function openSessionsPage(page, viewport) {
  await signInAsFixtureStaff(page);

  const sessionsLink = page.getByRole('link', { name: /نشست‌ها و دستگاه‌ها/ });
  if (viewport.name === 'mobile') {
    await page.getByRole('button', { name: 'باز کردن منو' }).click();
  }
  await tap(sessionsLink);
  await page.getByRole('heading', { name: 'نشست‌ها و دستگاه‌ها' }).waitFor({ state: 'visible', timeout: 15_000 });
  if (viewport.name === 'mobile') {
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: /نشست‌ها و دستگاه‌ها/ }).waitFor({ state: 'hidden' });
  }

  // Assert deterministic fixture mode so the shots are honest evidence.
  await page.getByText('NEXT_PUBLIC_SESSION_FIXTURE=true').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('listitem').filter({ hasText: 'این دستگاه' }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('li').filter({ hasText: 'مرورگر وب (مدیریت)' }).first().waitFor({ state: 'visible', timeout: 15_000 });
}

async function captureStates(page, viewport) {
  const shot = async state => {
    const file = resolve(repoRoot, `${outputDir}/${viewport.name}-${state}.png`);
    await page.screenshot({ path: file });
    console.log(`[shots] wrote ${file}`);
  };

  await openSessionsPage(page, viewport);
  await shot('01-session-list');

  const closeDialog = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10_000 });
  };

  await tap(page.getByRole('button', { name: 'خروج از دستگاه مرورگر وب (مدیریت)' }));
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  await shot('02-revoke-dialog');
  await closeDialog();

  await tap(page.getByRole('button', { name: 'خروج از همهٔ دستگاه‌ها' }));
  await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByText(/خارج می‌شوید/).waitFor({ state: 'visible', timeout: 10_000 });
  await shot('03-logout-all-dialog');
  await closeDialog();
}

async function main() {
  await mkdir(resolve(repoRoot, outputDir), { recursive: true });

  let server = null;
  try {
    if ((await up(baseURL)) === null) {
      server = startDevServer();
      for (let attempt = 0; attempt < 90; attempt += 1) {
        if ((await up(baseURL)) !== null) break;
        if (server.exitCode !== null) {
          throw new Error('[shots] admin dev server exited early. Check the fixture env wiring.');
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 1000));
      }
      if ((await up(baseURL)) === null) throw new Error(`[shots] admin dev server did not answer on ${baseURL} in time.`);
    }

    const browser = await chromium.launch();
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          baseURL,
          ...(viewport.name === 'desktop' ? { viewport: { width: viewport.width, height: viewport.height } } : viewport),
        });
        const page = await context.newPage();
        await captureStates(page, viewport);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  } finally {
    if (server?.exitCode === null) server.kill();
  }
}

main().catch(error => {
  console.error('[shots] FAILED:', error instanceof Error ? error.stack : error);
  process.exit(1);
});