import { expect, test } from '@playwright/test';
import {
  createExternalRequestsTracker,
  isMobile,
  signInFixtureCustomer,
  tap,
} from './helpers';

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

    await expect(page.getByRole('heading', { name: 'دسته‌بندی کالاها' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'کالاهای فروشگاه' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'خبرنامه هنوز فعال نیست' })).toBeVisible();
    await expect(page.getByText(/سایت کابینت‌سازان، بلوک صنعت ۳/)).toBeVisible();
    await expect(page.getByText(/ارسال رایگان برای خرید بالای/)).toHaveCount(0);

    await network.assertNone();
  });

  test('live catalog category cards navigate to their real routes', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await tap(page.locator('section#categories').getByRole('link', { name: 'ابزار برقی' }));
    await expect(page).toHaveURL(/\/category\/power-tools$/);
    await expect(page.getByRole('heading', { name: 'ابزار برقی' })).toBeVisible();

    await network.assertNone();
  });

  test('product card opens its route and adds to cart with a toast', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await signInFixtureCustomer(page);

    await tap(page.getByRole('link', { name: /دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰/ }).first());

    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeVisible();
    await expect(page.getByText('موجود در انبار')).toBeVisible();

    await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }));
    await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible();

    await network.assertNone();
  });

  test('homepage categories and products come from the same catalog fixture API', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page.locator('section#categories').getByRole('link')).toHaveCount(6);
    await expect(page.getByRole('link', { name: /دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰/ }).first()).toBeVisible();

    await network.assertNone();
  });

  test('desktop: search submits the query and renders its route', async ({ page }) => {
    test.skip(isMobile(page), 'desktop-only input');

    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const search = page.locator('header input#site-search-desktop');
    await expect(search).toBeVisible();

    await search.fill('دریل رونیکس');
    await expect(search).toHaveValue('دریل رونیکس');
    await search.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole('heading', { name: /نتایج جستجو/ })).toBeVisible();
    await expect(page.getByText(/دریل چکشی ۱۳/)).toBeVisible();
    await expect(page.getByText(/ست دریل و/)).toBeVisible();

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

    await expect(page.getByRole('button', { name: 'دسته‌بندی‌ها' })).toBeVisible();
    const support = page.getByRole('link', { name: 'تماس با فروشگاه' });
    await expect(support).toBeVisible();
    await expect(support).toHaveAttribute('href', /^tel:/);

    await tap(page.getByRole('button', { name: 'دسته‌بندی‌ها' }));
    await expect(page.locator('section#categories')).toBeInViewport();

    await tap(page.getByRole('button', { name: 'جستجو' }).first());
    await expect(page.locator('input[placeholder="جستجوی ابزار..."]')).toBeVisible();

    await network.assertNone();
  });
});
