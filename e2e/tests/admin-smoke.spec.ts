import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker } from './helpers';

test.describe('admin: authentication gate', () => {
  test('redirects anonymous / to /login with RTL, title and no third-party assets', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page).toHaveTitle('پنل عملیات ایران یراق');

    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await expect(page.getByRole('heading', { name: 'ورود به پنل عملیات' })).toBeVisible();
    await expect(page.getByLabel('کد دسترسی توسعه‌دهنده')).toBeVisible();

    await network.assertNone();
  });

  test('redirects anonymous /dashboard to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('renders the dev-only sign-in notice and no external assets on /login', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/login');

    await expect(page.getByText(/صرفاً برای محیط توسعه و آزمایش فعال است/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ورود' })).toBeVisible();

    await network.assertNone();
  });
});
