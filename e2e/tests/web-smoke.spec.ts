import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

test.describe('web: storefront shell', () => {
  test('renders the RTL storefront with landmarks and core content', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page).toHaveTitle(/ایران یراق/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    if (!isMobile(page)) {
      await expect(page.getByRole('link', { name: /خانه/ }).first()).toBeVisible();
    }

    await expect(page.getByText('دسته‌بندی تخصصی ابزار')).toBeVisible();
    await expect(page.getByText('ابزار محبوب هفته')).toBeVisible();
    await expect(page.getByText('پرفروش‌ترین‌ها').first()).toBeVisible();
    await expect(page.getByText('مجله آموزشی ایران یراق')).toBeVisible();
    await expect(page.getByText('چرا ۴۸ هزار استادکار، ایران یراق را انتخاب کرده‌اند؟')).toBeVisible();

    if (!isMobile(page)) {
      await expect(page.getByText('آدرس فروشگاه مرکزی')).toBeVisible();
    }

    await network.assertNone();
  });

  test('hero slider navigates through dots and keeps the counter in sync', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const dots = page.locator('section#home div[class*="bg-black/30"] button');
    await expect(dots).toHaveCount(3);

    await tap(dots.nth(1));
    await expect(page.getByText('دقت آلمانی، قدرت ایرانی')).toBeVisible();

    await tap(dots.nth(2));
    await expect(page.getByText('بهار در کارگاه شما')).toBeVisible();

    await tap(dots.nth(0));
    await expect(page.getByText('قدرت را در دست بگیرید')).toBeVisible();

    await expect(page.getByText('۰3 / ۰۳').or(page.getByText('۰1 / ۰۳'))).toBeVisible();

    await network.assertNone();
  });

  test('product card opens the detail modal and adds to cart with a toast', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await tap(page.locator('section#popular div[class*="snap-start"]').first());

    await expect(page.getByText('افزودن به سبد خرید')).toBeVisible();
    await expect(page.getByText('موجود در انبار')).toBeVisible();

    await tap(page.getByText('افزودن به سبد خرید'));
    await expect(page.getByText('به سبد افزوده شد')).toBeVisible();

    await network.assertNone();
  });

  test('category filter narrows the popular products carousel', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const cards = page.locator('section#popular div[class*="snap-start"]');
    await expect(cards).toHaveCount(6);

    await tap(page.getByRole('button', { name: 'ابزار برقی', exact: true }));
    await expect(cards).toHaveCount(3);

    await tap(page.getByRole('button', { name: 'باغبانی', exact: true }));
    await expect(cards).toHaveCount(1);

    await tap(page.getByRole('button', { name: 'ابزار دستی', exact: true }));
    await expect(cards).toHaveCount(1);

    await tap(page.getByRole('button', { name: 'همه', exact: true }));
    await expect(cards).toHaveCount(6);

    await network.assertNone();
  });

  test('desktop: search input binds the query and clears it', async ({ page }) => {
    test.skip(isMobile(page), 'desktop-only input');

    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const search = page.locator('header input[placeholder*="۲۵۰۰"]');
    await expect(search).toBeVisible();

    await search.fill('دریل رونیکس');
    await expect(search).toHaveValue('دریل رونیکس');

    await expect(page.getByRole('button', { name: 'پاک کردن جستجو' })).toBeVisible();
    await tap(page.getByRole('button', { name: 'پاک کردن جستجو' }));
    await expect(search).toHaveValue('');
    await expect(page.getByRole('button', { name: 'پاک کردن جستجو' })).toBeHidden();

    await network.assertNone();
  });

  test('mobile: floating bottom navigation and search toggle work', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile-only');

    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page.getByRole('button', { name: 'دسته‌ها' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'پشتیبانی' })).toBeVisible();

    await tap(page.getByRole('button', { name: 'پشتیبانی' }));
    await expect(page.getByText('پشتیبانی: ۰۲۱-۸۸۸۸۸۸۸۸')).toBeVisible();

    await tap(page.getByRole('button', { name: 'دسته‌ها' }));
    await expect(page.getByText('✓ دسته‌بندی‌ها', { exact: true })).toBeVisible();

    await tap(page.getByRole('button', { name: 'جستجو' }).first());
    await expect(page.locator('input[placeholder="جستجوی ابزار..."]')).toBeVisible();

    await network.assertNone();
  });
});