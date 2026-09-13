import { expect, test } from '@playwright/test';
import { adminSidebar, createExternalRequestsTracker, isMobile, signInDiAsAdmin } from './helpers';

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

test('staff login route renders the real endpoint-backed form in a ship build', async ({ page }) => {
    // The CI/ship build is compiled without NEXT_PUBLIC_FIXTURE_AUTH=true, so the
    // real staff-auth API is the default against /api/v1/auth/* (parallel-work
    // handoff, AUTH_CONTRACT §17); /login/staff renders the live password form.
    await page.goto('/login/staff');

    await expect(page.getByText(/فعّال نیست/)).toHaveCount(0);
    await expect(page.getByLabel('شناسه کارکن')).toBeVisible();
    await expect(page.getByLabel('رمز عبور')).toBeVisible();
    await expect(page.getByRole('button', { name: 'ادامه' })).toBeVisible();
  });
});

test.describe('admin: authenticated shell', () => {
  test('signs in and shows the sidebar, dashboard link and main content', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);

    await signInDiAsAdmin(page);

    const sidebar = adminSidebar(page);
    await expect(page.getByRole('main')).toBeVisible();

    if (isMobile(page)) {
      // On mobile the sidebar is a closed drawer; its contents become visible
      // only once opened (covered by the dedicated drawer test).
      await expect(sidebar).toBeHidden();
      await expect(page.getByRole('button', { name: 'باز کردن منو' })).toBeVisible();
    } else {
      await expect(sidebar).toBeVisible();
      await expect(sidebar.getByRole('link', { name: /داشبورد/ })).toBeVisible();
    }
  });

  test('shows the developer profile, version and an actionable notifications bell (fixture)', async ({ page }) => {
    await signInDiAsAdmin(page);

    // Phase A: the bell is enabled and opens the clearly-labeled fixture panel.
    const bell = page.getByRole('button', { name: /اعلان‌ها/ });
    await expect(bell).toBeVisible();
    await bell.click();
    await expect(page.getByText('دادهٔ آزمایشی — جریان واقعی اعلان هنوز متصل نشده است.')).toBeVisible();
    await page.keyboard.press('Escape');

    if (isMobile(page)) {
      // On mobile the profile label (and the sidebar footer) collapse to the
      // avatar only and the closed drawer, respectively, by responsive design.
      await expect(page.getByRole('button', { name: 'باز کردن منو' })).toBeVisible();
    } else {
      // The developer identity now lives inside the account menu behind the avatar.
      await page.getByRole('button', { name: 'منوی حساب کاربری' }).click();
      await expect(page.getByText('مدیر سیستم')).toBeVisible();
      await expect(adminSidebar(page).getByText(/نسخهٔ پایه/)).toBeVisible();
    }
  });

  test('opens the mobile drawer with focus trap and closes on Escape', async ({ page }) => {
    test.skip(!isMobile(page), 'drawer is a mobile-only interaction');

    await signInDiAsAdmin(page);

    const sidebar = adminSidebar(page);
    const closeButton = sidebar.getByRole('button', { name: 'بستن منو' });
    await expect(sidebar).toBeHidden();

    await page.getByRole('button', { name: 'باز کردن منو' }).click();
    await expect(sidebar).toBeVisible();
    await expect(closeButton).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(sidebar).toBeHidden();
  });
});
