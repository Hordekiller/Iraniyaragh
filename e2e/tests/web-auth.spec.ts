import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

const MOBILE = '09123456789';
const VALID_CODE = '123456';
const INVALID_CODE = '000000';

/**
 * Opens the customer OTP login dialog through the relevant entry point for the
 * current viewport: the mobile bottom-nav "پروفایل" button or the header's
 * "ورود به حساب کاربری" account button. Both route to the same LoginDialog.
 */
async function openLogin(page: Page) {
  if (isMobile(page)) {
    await tap(page.getByRole('button', { name: 'پروفایل' }));
  } else {
    await tap(page.getByRole('button', { name: 'ورود به حساب کاربری' }));
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ورود با شماره موبایل' })).toBeVisible();
}

async function requestCode(page: Page) {
  await page.locator('#login-mobile').fill(MOBILE);
  await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
  await expect(page.getByRole('heading', { name: 'کد تایید را وارد کنید' })).toBeVisible();
  await expect(page.locator('#login-otp-code')).toBeFocused();
}

test.describe('web: customer OTP login (fixture client, #50)', () => {
  test('logs in with a valid mobile and code, then logs out from the account menu', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);
    await expect(page.locator('#login-mobile')).toBeFocused();

    await requestCode(page);
    await page.locator('#login-otp-code').fill(VALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));

    await expect(page.getByRole('dialog')).toBeHidden();

    // AUTH_CONTRACT §7: session secrets stay memory-only.
    expect(
      await page.evaluate(() => ({
        local: localStorage.length,
        session: sessionStorage.length,
      })),
    ).toEqual({ local: 0, session: 0 });

    // A reload must not restore the in-memory session.
    await page.reload();
    await expect(page.getByRole('button', { name: 'ورود به حساب کاربری' })).toBeVisible();

    await openLogin(page);
    await requestCode(page);
    await page.locator('#login-otp-code').fill(VALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
    await expect(page.getByRole('dialog')).toBeHidden();

    const accountButton = page.getByRole('button', { name: 'حساب کاربری' });
    await expect(accountButton).toBeVisible();
    await tap(accountButton);
    await expect(page.getByText('fixture-user-otp-1').first()).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'خروج از حساب' })).toBeVisible();

    await tap(page.getByRole('menuitem', { name: 'خروج از حساب' }));
    await expect(page.getByRole('button', { name: 'ورود به حساب کاربری' })).toBeVisible();

    await network.assertNone();
  });

  test('rejects an invalid code with a localized error', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);
    await requestCode(page);

    await page.locator('#login-otp-code').fill(INVALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));

    await expect(page.getByRole('alert')).toContainText('کد واردشده صحیح نیست.');

    await network.assertNone();
  });

  test('locks submits and resend with a countdown after repeated invalid codes', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);
    await requestCode(page);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.locator('#login-otp-code').fill(INVALID_CODE);
      await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
    }

    await expect(page.getByRole('alert')).toContainText(
      'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.',
    );

    const retry = page.getByRole('button', { name: /تلاش مجدد/ });
    await expect(retry).toBeDisabled();
    await expect(retry).toContainText('(');

    const resend = page.getByRole('button', { name: /ارسال مجدد/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText('(');

    await network.assertNone();
  });

  test('gates resend until the resend window elapses', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);
    await requestCode(page);

    const resend = page.getByRole('button', { name: /ارسال مجدد/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText('ارسال مجدد (');

    await network.assertNone();
  });
});