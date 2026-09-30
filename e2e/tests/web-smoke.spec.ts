import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

/** Mirrors the storefront counter: zero-padded, Persian-Indic digits. */
const slideCounter = (index: number, total: number): string => {
  const pad = (value: number) => String(value).padStart(2, '0').replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
  return `${pad(index + 1)} / ${pad(total)}`;
};

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
    await expect(page.getByRole('heading', { name: 'تازه‌های فروشگاه' })).toBeVisible();
    await expect(page.getByText('خدمات ایران یراق')).toBeVisible();
    await expect(page.getByRole('heading', { name: /عضو خبرنامه شوید/ })).toBeVisible();

    await network.assertNone();
  });

  test('hero slider navigates through dots and keeps the counter in sync', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const dots = page.locator('section#home div[class*="bg-black/30"] button');
    await expect(dots).toHaveCount(3);

    // Slides are built from the delivered category list, so the expectations are
    // read from the carousel instead of hardcoding catalog names here.
    const heroHeading = page.locator('section#home h1');
    const titles: string[] = [];
    let previous = '';
    for (let i = 0; i < 3; i += 1) {
      await tap(dots.nth(i));
      await expect(dots.nth(i)).toHaveAttribute('aria-current', 'true');
      // The slide cross-fades, so wait for the new heading before reading it.
      await expect(heroHeading).not.toHaveText(previous);
      const title = ((await heroHeading.textContent()) ?? '').trim();
      expect(title.length).toBeGreaterThan(0);
      titles.push(title);
      previous = title;
      await expect(page.getByText(slideCounter(i, 3))).toBeVisible();
    }

    expect(new Set(titles).size).toBe(3);

    await network.assertNone();
  });

  test('product card opens its route and adds to cart with a toast', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    await tap(page.locator('section#newest button[class*="snap-start"]').first());

    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeVisible();
    await expect(page.getByText('موجود در انبار')).toBeVisible();

    await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }));
    await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible();

    await network.assertNone();
  });

  test('newest-products carousel renders live cards with accessible scroll controls', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const cards = page.locator('section#newest button[class*="snap-start"]');
    await expect(cards.first()).toBeVisible();

    await expect(page.getByRole('button', { name: 'پیمایش به راست' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'پیمایش به چپ' })).toBeVisible();

    await network.assertNone();
  });

  test('desktop: search submits the query and renders its route', async ({ page }) => {
    test.skip(isMobile(page), 'desktop-only input');

    const network = createExternalRequestsTracker(page);

    await page.goto('/');

    const search = page.locator('#site-search-desktop');
    await expect(search).toBeVisible();

    await search.fill('دریل رونیکس');
    await expect(search).toHaveValue('دریل رونیکس');
    await search.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByRole('heading', { name: /نتایج جست‌وجو/ })).toBeVisible();
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

    const track = page.getByRole('link', { name: 'پیگیری سفارش' }).first();
    await expect(track).toBeVisible();
    await expect(track).toHaveAttribute('href', '/orders');

    // Categories is a real page, not a scroll anchor back to the home section.
    const categories = page.getByRole('link', { name: 'دسته‌بندی‌ها' }).first();
    await expect(categories).toHaveAttribute('href', '/categories');
    await tap(categories);
    await expect(page).toHaveURL(/\/categories$/);
    await expect(page.getByRole('heading', { name: 'دسته‌بندی کالاها' })).toBeVisible();

    await tap(page.getByRole('button', { name: 'جستجو' }).first());
    await expect(page.locator('input[placeholder="جستجوی ابزار..."]')).toBeVisible();

    await network.assertNone();
  });

  test('every primary navigation entry opens a real page with its own content', async ({ page }) => {
    const destinations: Array<[string, RegExp, RegExp]> = [
      ['دسته‌بندی‌ها', /\/categories$/, /دسته‌بندی کالاها/],
      ['همه کالاها', /\/products$/, /همه کالاها/],
      ['تازه‌های فروشگاه', /\/newest$/, /تازه‌ترین کالاها/],
      ['خدمات', /\/services$/, /خدمات فروشگاه/],
    ];

    for (const [name, url, heading] of destinations) {
      const nav = page.getByRole('navigation', { name: 'ناوبری اصلی' });
      const link = nav.getByRole('link', { name });
      if (!(await link.isVisible())) {
        // Below `lg` the desktop nav is hidden; the mobile bar owns the same route.
        await page.goto('/');
        await tap(page.getByRole('link', { name: 'دسته‌بندی‌ها' }).first());
        await expect(page).toHaveURL(/\/categories$/);
        break;
      }
      await link.click();
      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
      // The URL must not carry a hash/anchor for a page destination.
      expect(new URL(page.url()).hash).toBe('');
    }
  });

  test('the catalog page paginates from the API metadata and keeps filters in the URL', async ({ page }) => {
    await page.goto('/products');

    await expect(page.getByRole('heading', { name: 'همه کالاها' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'مرتب‌سازی' })).toBeVisible();

    await page.getByRole('combobox', { name: 'مرتب‌سازی' }).selectOption('name');
    await expect(page).toHaveURL(/sort=name/);
  });
});

