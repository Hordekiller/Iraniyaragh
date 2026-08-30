import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

test.describe('admin: operations shell', () => {
  test('redirects / to /dashboard with RTL, landmarks and no third-party assets', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page).toHaveTitle('پنل عملیات ایران یراق');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const sidebar = page.getByRole('complementary', { name: 'منوی اصلی' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('link', { name: /داشبورد/ })).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();

    if (!isMobile(page)) {
      await expect(page.getByText('نسخهٔ پایه')).toBeVisible();
      await expect(page.getByText('v0.1.0')).toBeVisible();
    }

    await network.assertNone();
  });

  test('desktop: top bar shows developer profile and disabled notification', async ({ page }) => {
    test.skip(isMobile(page), 'desktop-only');

    await page.goto('/');

    await expect(page.getByText('مدیر سیستم')).toBeVisible();
    await expect(page.getByText('حساب آزمایشی')).toBeVisible();
    await expect(page.getByRole('button', { name: /اعلان‌ها/ })).toBeDisabled();
  });

  test('mobile: drawer opens with focus trap and closes on Escape', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile-only');

    await page.goto('/');

    await tap(page.getByRole('button', { name: 'باز کردن منو' }));

    const dialog = page.getByRole('dialog', { name: 'منوی اصلی' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: /داشبورد/ })).toBeVisible();

    const overflowWhileOpen = await dialog.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflowWhileOpen).toBe('hidden');

    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'بستن منو');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const overflowAfterClose = await page.evaluate(() => getComputedStyle(document.body).overflow);
    expect(overflowAfterClose).not.toBe('hidden');
  });
});