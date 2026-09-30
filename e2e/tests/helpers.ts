import { expect } from '@playwright/test';
import { generate } from 'otplib';
import { waitForFreshTotpStep } from './totp-step';
import type { Locator, Page, Request, Response } from '@playwright/test';

export const isMobile = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 768;

/**
 * Stable locator for the admin sidebar drawer.
 *
 * The AdminShell swaps the element's ARIA role between `complementary` (closed)
 * and `dialog` (open) when the mobile drawer is toggled, so a role-based query
 * (getByRole('complementary')) can never target it in both states. Matching on
 * the element/tag and its stable `aria-label` works regardless of the open state.
 */
export const adminSidebar = (page: Page): Locator => page.locator('aside[aria-label="منوی اصلی"]');

/**
 * Signs a staff administrator in through the real password + TOTP sign-in.
 *
 * The admin panel has exactly one sign-in path: `/login` posts the staff
 * password to `/auth/staff/password` and then the six-digit code to
 * `/auth/staff/totp/verify`. There is no development access code and no
 * test-only back door, so the suite exercises the same contract an operator
 * uses. Only the *identity* is provisioned for the test database (see
 * `apps/api auth:e2e-staff`); the session, the rate limiter, the challenge and
 * the TOTP verification are all genuine.
 *
 * The TOTP code is produced with the same `otplib` release the API verifies
 * with, so the suite can never drift from the server's algorithm, period or
 * digit count.
 */
export async function signInDiAsAdmin(page: Page) {
  const identifier = process.env.E2E_STAFF_EMAIL;
  const password = process.env.E2E_STAFF_PASSWORD;
  const totpSecret = process.env.E2E_STAFF_TOTP_SECRET;
  if (!identifier || !password || !totpSecret) {
    throw new Error(
      'E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD and E2E_STAFF_TOTP_SECRET must be set to sign in to the admin panel in e2e. ' +
        'Provision the identity with `pnpm --filter @iranyaragh/api auth:e2e-staff`.',
    );
  }

  // Record the real reason a sign-in did not advance: the admin UI renders one
  // friendly sentence for half a dozen server codes, so without this a failure
  // only says "the code field never appeared".
  const authFailures: string[] = [];
  const pendingBodies: Promise<void>[] = [];
  const recordAuthFailure = (response: Response): void => {
    const url = response.url();
    const status = response.status();
    // The path is matched loosely on purpose: if NEXT_PUBLIC_API_BASE_URL was
    // missing from the admin build, the request silently goes to the admin's own
    // origin and 404s, which is the most confusing way this can break.
    if (!url.includes('/auth/staff/') || status < 400) return;
    // The body carries the machine code the UI hides behind one friendly
    // sentence, so capture it: "401 vs 409" is the difference between a wrong
    // code and a consumed TOTP step. Reading it is asynchronous, so the report
    // below waits for it instead of racing it.
    const path = url.split('/').slice(3).join('/');
    pendingBodies.push(
      response
        .json()
        .then((body: { code?: string }) => {
          authFailures.push(`${status} ${body.code ?? 'no-code'}:${path}`);
        })
        .catch(() => {
          authFailures.push(`${status} unreadable-body:${path}`);
        }),
    );
  };
  const reportAuthFailures = async (): Promise<string> => {
    page.off('response', recordAuthFailure);
    await Promise.allSettled(pendingBodies);
    return authFailures.length > 0 ? authFailures.join(', ') : 'none failed';
  };
  page.on('response', recordAuthFailure);

  await page.goto('/login');
  await page.getByLabel('شناسه کارکن').fill(identifier);
  await page.getByLabel('رمز عبور').fill(password);
  await page.getByRole('button', { name: 'ادامه' }).click();

  const codeInput = page.getByLabel('کد تایید شش‌رقمی');
  try {
    await expect(codeInput).toBeVisible({ timeout: 15_000 });
  } catch (cause) {
    throw new Error(
      `Staff sign-in never reached the TOTP step. Staff auth responses: ${await reportAuthFailures()}.`,
      { cause },
    );
  }
  await waitForFreshTotpStep();
  const submittedCode = await generate({ secret: totpSecret });
  const submittedAtStep = Math.floor(Date.now() / 30_000);
  await codeInput.fill(submittedCode);
  await page.getByRole('button', { name: 'ورود', exact: true }).click();

  let signInFailure: string | null = null;
  try {
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  } catch {
    signInFailure = `Staff sign-in did not reach the dashboard. Submitted code for step ${submittedAtStep}. ` +
      `Staff auth responses: ${await reportAuthFailures()}.`;
  }
  page.off('response', recordAuthFailure);
  if (signInFailure !== null) throw new Error(signInFailure);
}

/**
 * Signs a storefront customer in through the fixture-mode OTP UI.
 *
 * Customer access tokens are memory-only, so each isolated browser page must
 * establish its own session through the UI instead of injecting storage state.
 */
export async function signInFixtureCustomer(page: Page) {
  await page.goto('/');
  if (isMobile(page)) {
    await tap(
      page
        .getByRole('navigation', { name: 'ناوبری پایین' })
        .getByRole('button', { name: 'حساب کاربری' }),
    );
  } else {
    await tap(page.getByRole('button', { name: 'ورود به حساب کاربری' }));
  }
  await page.locator('#login-mobile').fill('09123456789');
  await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
  await page.locator('#login-otp-code').fill('123456');
  await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
  await expect(page.getByRole('dialog')).toBeHidden();
}

/**
 * Clicks the element the way a person would, falling back to a synthetic click.
 *
 * A real `locator.click()` is preferred because some MUI widgets (menus,
 * autocomplete popups, selects) only open on a full pointer interaction and
 * ignore a bare dispatched `click`.
 *
 * The fallback exists for a known Chromium bug: on RTL pages under mobile
 * emulation the document reports a negative `scrollLeft`, which breaks
 * Playwright's hit-target maths — the resolved click point lands outside the
 * visual viewport and the document root "intercepts the pointer events".
 * Playwright fails such a click with an actionability/timeout error instead of
 * misfiring, so falling back is safe.
 */
export async function tap(locator: Locator) {
  try {
    await locator.click({ timeout: 5_000 });
    return;
  } catch {
    await locator.scrollIntoViewIfNeeded().catch(() => undefined);
    await locator.dispatchEvent('click');
  }
}

/**
 * Records every http(s) request the page makes and fails the test as soon as an
 * assertion runs if any of them target an origin different from the page origin.
 *
 * Both app shells are self-hosted foundations: the storefront and the admin
 * panel must never load third-party assets (fonts, scripts, images). The web
 * app self-hosts Vazirmatn as a variable woff2; the admin uses local fonts and
 * a strict CSP.
 */
export function createExternalRequestsTracker(page: Page) {
  const requests: string[] = [];
  const onRequest = (request: Request) => {
    if (/^https?:\/\//.test(request.url())) requests.push(request.url());
  };
  page.on('request', onRequest);

  return {
    async assertNone() {
      await page.waitForLoadState('networkidle').catch(() => undefined);
      page.off('request', onRequest);
      const pageOrigin = new URL(page.url()).origin;
      const external = requests.filter(url => new URL(url).origin !== pageOrigin);
      expect(external, `External asset requests observed: ${external.join(', ')}`).toEqual([]);
    },
  };
}
