import { expect, test } from '@playwright/test';
import {
  createExternalRequestsTracker,
  isMobile,
  signInFixtureCustomer,
  tap,
} from './helpers';

test.describe('web: storefront shell', () => {
  test('remains usable while the approved Enamad image request is pending', async ({ page }) => {
    const logo = 'https://trustseal.enamad.ir/logo.aspx?id=8119011&Code=rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3';
    // Model an unavailable external image without fabricating a successful
    // response or replacing any application/API path.
    await page.route(logo, () => {});
    const network = createExternalRequestsTracker(page);
    // Lazy loading may start before navigation finishes. Observe first so an
    // already-started seal request cannot be missed on slower CI navigation.
    const imageRequest = page.waitForRequest(logo);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('img', { name: 'نماد اعتماد الکترونیکی ایرانی یراق' }).scrollIntoViewIfNeeded();
    expect((await imageRequest).resourceType()).toBe('image');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('link', { name: 'نماد اعتماد الکترونیکی ایرانی یراق؛ باز شدن در پنجرهٔ جدید' })).toBeVisible();
    // Preserve the tracker across full document replacement, like the real
    // admin-to-homepage-to-product description journey.
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('banner')).toBeVisible();
    await page.getByRole('img', { name: 'نماد اعتماد الکترونیکی ایرانی یراق' }).scrollIntoViewIfNeeded();
    await network.assertNone();
  });

  test('renders the RTL storefront with landmarks and core content', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await expect(page).toHaveTitle(/ایرانی یراق/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();

    if (!isMobile(page)) {
      await expect(page.getByRole('link', { name: /خانه/ }).first()).toBeVisible();
    }

    await expect(page.getByRole('heading', { name: 'دسته‌بندی کالاها' })).toBeVisible();
    const categoryCarousels = page.locator('section[aria-labelledby^="home-category-"]');
    await expect(categoryCarousels.first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'خبرنامه هنوز فعال نیست' })).toBeVisible();

    // Unconfirmed contact and business claims must not reach the storefront.
    // The e2e build sets no `VITE_SITE_*` values, so the shell renders the
    // "not published yet" note instead of a placeholder address or number.
    await expect(page.getByText('اطلاعات تماس فروشگاه هنوز منتشر نشده است.')).toBeVisible();
    await expect(page.getByText(/کابینت‌سازان/)).toHaveCount(0);
    await expect(page.getByText(/ارسال رایگان برای خرید بالای/)).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);

    const seal = page.getByRole('link', { name: 'نماد اعتماد الکترونیکی ایرانی یراق؛ باز شدن در پنجرهٔ جدید' });
    await expect(seal).toHaveAttribute('href', 'https://trustseal.enamad.ir/?id=8119011&Code=rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3');
    await expect(seal).toHaveAttribute('target', '_blank');
    await expect(seal).toHaveAttribute('rel', 'noopener');
    await expect(seal).toHaveAttribute('referrerpolicy', 'origin');
    const sealImage = seal.getByRole('img', { name: 'نماد اعتماد الکترونیکی ایرانی یراق' });
    await expect(sealImage).toHaveAttribute('src', 'https://trustseal.enamad.ir/logo.aspx?id=8119011&Code=rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3');
    await expect(sealImage).toHaveAttribute('referrerpolicy', 'origin');
    await expect(sealImage).toHaveAttribute('code', 'rwTZwxgkNaMb5nO8mWJkYJWzTIGgPpV3');

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
    const categoryCarousels = page.locator('section[aria-labelledby^="home-category-"]');
    await expect(categoryCarousels.first().getByRole('link', { name: /دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰/ })).toBeVisible();
    const productCount = await categoryCarousels.first().getByRole('listitem').count();
    expect(productCount).toBeGreaterThan(0);
    expect(productCount).toBeLessThanOrEqual(8);

    expect(await categoryCarousels.count()).toBeLessThanOrEqual(3);
    await expect(categoryCarousels.first().getByRole('link', { name: 'مشاهده همه' })).toHaveAttribute('href', /\/category\//);

    await network.assertNone();
  });

  test('homepage product carousels remain operable in RTL on desktop and mobile', async ({ page }) => {
    await page.goto('/');
    const carousel = page.locator('section[aria-labelledby^="home-category-"]').first();
    const list = carousel.getByRole('list');
    await expect(list).toHaveAttribute('dir', 'rtl');
    const start = await list.evaluate(element => element.scrollLeft);
    await tap(carousel.getByRole('button', { name: /کالاهای بعدی/ }));
    await expect.poll(() => list.evaluate(element => element.scrollLeft)).not.toBe(start);
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true);
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
    // No phone is configured for this build, so the bottom nav must not offer a
    // contact affordance that would dial a number nobody has confirmed.
    await expect(page.getByRole('link', { name: 'تماس با فروشگاه' })).toHaveCount(0);

    await tap(page.getByRole('button', { name: 'دسته‌بندی‌ها' }));
    await expect(page.locator('section#categories')).toBeInViewport();

    await tap(page.getByRole('button', { name: 'جستجو' }).first());
    await expect(page.locator('input[placeholder="جستجوی ابزار..."]')).toBeVisible();

    await network.assertNone();
  });
});
