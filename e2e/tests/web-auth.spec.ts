import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

const VALID_CODE = '123456';
const INVALID_CODE = '000000';

async function openLogin(page: import('@playwright/test').Page) {
  if (isMobile(page)) {
    await tap(page.getByRole('button', { name: 'پروفایل' }));
  } else {
    await tap(page.getByRole('button', { name: 'ورود به حساب کاربری' }));
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('ورود با شماره موبایل')).toBeVisible();
}

test.describe('web: customer OTP auth flow (fixture client)', () => {
  test('logs in with a valid mobile + code and logs out via the account menu', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);

    await page.locator('input[inputmode="tel"]').fill('09123456789');
    await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));

    await expect(page.getByText('کد تایید را وارد کنید')).toBeVisible();
    await page.locator('input[inputmode="numeric"]').fill(VALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));

    await expect(page.getByRole('dialog')).toBeHidden();

    const accountButton = page.getByRole('button', { name: 'حساب کاربری' });
    await expect(accountButton).toBeVisible();

    await tap(accountButton);
    await expect(page.getByText('خروج از حساب')).toBeVisible();
    await expect(page.locator('text=fixture-user-otp-1').first()).toBeVisible();

    await tap(page.getByRole('button', { name: 'خروج از حساب' }));
    await expect(page.getByText('خروج از حساب')).toBeHidden();
    await expect(page.getByRole('button', { name: 'ورود به حساب کاربری' })).toBeVisible();

    await network.assertNone();
  });

  test('rejects an invalid code with a localized error', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);

    await page.locator('input[inputmode="tel"]').fill('09123456789');
    await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
    await expect(page.getByText('کد تایید را وارد کنید')).toBeVisible();

    await page.locator('input[inputmode="numeric"]').fill(INVALID_CODE);
    await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));

    await expect(page.getByText('کد واردشده صحیح نیست.')).toBeVisible();

    await network.assertNone();
  });

  test('resend is gated until the resend window elapses', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await openLogin(page);

    await page.locator('input[inputmode="tel"]').fill('09123456789');
    await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
    await expect(page.getByText('کد تایید را وارد کنید')).toBeVisible();

    const resend = page.getByRole('button', { name: /ارسال مجدد/ });
    await expect(resend).toBeDisabled();
    await expect(resend).toContainText('ارسال مجدد (');

    await network.assertNone();
  });
});
