import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  createExternalRequestsTracker,
  isMobile,
  signInDiAsAdmin,
  tap,
} from './helpers';

/**
 * Session and device management for the dev admin (#50).
 *
 * The sign-in token is held in memory only (AUTH_CONTRACT §7), so navigating to
 * an authenticated route must happen through a client-side navigation (sidebar
 * link), never a full page.goto() which restarts the JS context and drops the
 * token.
 */
async function openSessionsPage(page: Page) {
  await signInDiAsAdmin(page);

  const sessionsLink = page.getByRole('link', { name: /نشست‌ها و دستگاه‌ها/ });
  if (isMobile(page)) {
    await page.getByRole('button', { name: 'باز کردن منو' }).click();
  }
  await tap(sessionsLink);
  await expect(page.getByRole('heading', { name: 'نشست‌ها و دستگاه‌ها' })).toBeVisible();
}

/** The `li` row that flags the *current* device (the live sign-in session). */
function currentSessionRow(page: Page) {
  return page.locator('li').filter({ hasText: 'این دستگاه' }).first();
}

test.describe('admin: session and device management', () => {
  test('lists the live sessions through the real API (no fixture banner)', async ({ page }) => {
    const network = createExternalRequestsTracker(page);
    await openSessionsPage(page);

    // The CI build has no NEXT_PUBLIC_SESSION_FIXTURE, so the page must be
    // served by the live HTTP client; the fixture notice must not appear.
    await expect(page.getByText('NEXT_PUBLIC_SESSION_FIXTURE=true')).toHaveCount(0);

    // The dev admin signed in on this device, so exactly one current row exists.
    await expect(page.getByRole('listitem').filter({ hasText: 'این دستگاه' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'خروج از همهٔ دستگاه‌ها' })).toBeVisible();

    await network.assertNone();
  });

  test('revoking the current device signs the operator out to /login', async ({ page }) => {
    await openSessionsPage(page);

    await tap(currentSessionRow(page).getByRole('button', { name: /خروج از دستگاه/ }));
    await expect(page.getByText(/این نشست بلافاصله از پنل مدیریت خارج می‌شود/)).toBeVisible();

    await tap(page.getByTestId('session-confirm-button'));
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });

  test('logout-all revokes every session and redirects to /login', async ({ page }) => {
    await openSessionsPage(page);

    await tap(page.getByRole('button', { name: 'خروج از همهٔ دستگاه‌ها' }));
    await expect(page.getByText(/از تمام نشست‌های فعال این حساب خارج می‌شود/)).toBeVisible();

    await tap(page.getByTestId('session-confirm-button'));
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });
});