#!/usr/bin/env node
/**
 * Captures desktop + mobile screenshots of the customer OTP auth surface for
 * the #50 acceptance evidence ("desktop/mobile screenshots accompany the PR").
 *
 * It drives the same states the storefront E2E asserts (see web-auth.spec.ts)
 * through the FIXTURE build, so the screenshots are deterministic and need no
 * SMS provider or live session:
 *
 *   01 mobile-number entry   02 code entry    03 invalid-code alert    04 rate-limited
 *
 * Setup: the script serves the fixture build itself if nothing is already
 * listening on the preview port, so run it from the repo root after building:
 *
 *   pnpm --filter @iranyaragh/web build --mode fixture-e2e
 *   pnpm --filter @iranyaragh/e2e screenshots
 *
 * Output: docs/screenshots/auth/<viewport>-<state>.png
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const previewPort = Number(process.env.WEB_E2E_PORT ?? 4173);
const baseURL = process.env.WEB_E2E_URL ?? `http://127.0.0.1:${previewPort}`;
const outputDir = './docs/screenshots/auth';

const MOBILE = '09123456789';
const INVALID_CODE = '000000';

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
 * driven, so a dispatched click exercises the real behavior.
 */
async function tap(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.dispatchEvent('click');
}

function startPreview() {
  console.log(`\n[shots] no server on ${baseURL}; starting fixture preview…`);
  const child = spawn(
    'pnpm',
    ['--filter', '@iranyaragh/web', 'preview', '--host', '127.0.0.1', '--port', String(previewPort), '--strictPort'],
    { cwd: repoRoot, stdio: 'ignore' },
  );
  return child;
}

async function openLogin(page, viewport) {
  const accountEntry = viewport.name === 'mobile'
    ? page.getByRole('button', { name: 'پروفایل' })
    : page.getByRole('button', { name: 'ورود به حساب کاربری' });
  await accountEntry.waitFor({ state: 'visible', timeout: 15_000 });
  await tap(accountEntry);
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: 'ورود با شماره موبایل' }).waitFor({ state: 'visible' });
}

async function requestCode(page) {
  await page.locator('#login-mobile').fill(MOBILE);
  await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
  await page.getByRole('heading', { name: 'کد تایید را وارد کنید' }).waitFor({ state: 'visible' });
}

async function captureStates(page, viewport) {
  const shot = async state => {
    const file = resolve(repoRoot, `${outputDir}/${viewport.name}-${state}.png`);
    await page.screenshot({ path: file });
    console.log(`[shots] wrote ${file}`);
  };

  await page.goto(baseURL);
  await openLogin(page, viewport);
  await shot('01-mobile-step');

  await requestCode(page);
  await shot('02-code-step');

  await page.locator('#login-otp-code').fill(INVALID_CODE);
  await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
  await page.getByRole('alert').filter({ hasText: 'کد واردشده صحیح نیست.' }).waitFor({ state: 'visible' });
  await shot('03-invalid-code');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.locator('#login-otp-code').fill(INVALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
  }
  await page.getByRole('alert').filter({ hasText: 'درخواست‌های زیادی ثبت شده است.' }).waitFor({ state: 'visible' });
  const retry = page.getByRole('button', { name: /تلاش مجدد/ });
  await retry.waitFor({ state: 'visible' });
  if (await retry.isDisabled() !== true) {
    throw new Error('[shots] expected the retry button to be disabled in the rate-limited state.');
  }
  await shot('04-rate-limited');
}

async function main() {
  await mkdir(resolve(repoRoot, outputDir), { recursive: true });

  // Serve the fixture build unless a server (e.g. the e2e suite) is already up.
  let preview = null;
  try {
    if ((await up(baseURL)) === null) {
      preview = startPreview();
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if ((await up(baseURL)) !== null) break;
        if (preview.exitCode !== null) {
          throw new Error('[shots] web fixture preview exited early. Did you run `--mode fixture-e2e` build?');
        }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 1000));
      }
      if ((await up(baseURL)) === null) throw new Error(`[shots] preview did not answer on ${baseURL} in time.`);
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
    if (preview?.exitCode === null) preview.kill();
  }
}

main().catch(error => {
  console.error('[shots] FAILED:', error instanceof Error ? error.stack : error);
  process.exit(1);
});