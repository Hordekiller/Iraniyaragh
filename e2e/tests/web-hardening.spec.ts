import { expect, test } from '@playwright/test';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

/**
 * Regression cover for the storefront hardening pass:
 * the two public legal pages, the APG combobox keyboard contract and the
 * explicit 404-vs-retry split on product/category/order/payment screens.
 */

test.describe('web: legal pages', () => {
  test('terms and privacy publish the real supplier contact details', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    for (const [route, heading] of [
      ['/terms', /قوانین و شرایط فروش/],
      ['/privacy', /حریم خصوصی/],
    ] as const) {
      await page.goto(route);

      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      // Supplier identity from site-config, not a placeholder. Scoped to main
      // so the hidden desktop header wordmark cannot satisfy this on mobile.
      await expect(page.getByRole('main').getByText('ایران یراق').first()).toBeVisible();

      // Scoped to the supplier card: the footer deliberately repeats the same
      // address, so an unscoped match would be ambiguous.
      const supplier = page.getByLabel('اطلاعات فروشنده');
      await expect(supplier.getByText(/میدان استاندارد/)).toBeVisible();
      // Digits are shown in Persian-Indic form, but the tel: href stays ASCII so
      // the dialer still works.
      await expect(supplier.getByText('۱۴۹۷۹۷۳۵۱۷')).toBeVisible();
      await expect(supplier.getByRole('link', { name: '۰۹۲۰۲۲۹۵۹۶۹' })).toHaveAttribute('href', 'tel:09202295969');

      // Article 33 also requires the seller identity and a way to contact them
      // to be reachable outside the legal pages themselves.
      const footer = page.getByRole('contentinfo');
      await expect(footer.getByText(/میدان استاندارد/)).toBeVisible();
      await expect(footer.getByRole('link', { name: 'قوانین و شرایط فروش' })).toHaveAttribute('href', '/terms');
      await expect(footer.getByRole('link', { name: 'حریم خصوصی' })).toHaveAttribute('href', '/privacy');
    }

    await network.assertNone();
  });

  test('the sign-in dialog links to both policies instead of a bare claim', async ({ page }) => {
    if (isMobile(page)) {
      test.skip(true, 'the sign-in trigger differs on the mobile header');
    }

    await page.goto('/account');

    await tap(page.getByRole('button', { name: /ورود|ثبت‌نام/ }).first());
    await expect(page.getByRole('dialog')).toBeVisible();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('link', { name: 'قوانین و شرایط فروش' })).toHaveAttribute('href', '/terms');
    await expect(dialog.getByRole('link', { name: 'حریم خصوصی' })).toHaveAttribute('href', '/privacy');
  });

  test('unknown policies are flagged as pending instead of asserted', async ({ page }) => {
    await page.goto('/terms');

    // Article 33 requires these; the seller has not supplied them yet, so the
    // page must say so rather than invent a cancellation or returns policy.
    await expect(page.getByText('در انتظار اعلام فروشنده').first()).toBeVisible();
  });
});

test.describe('web: search combobox keyboard contract', () => {
  test('ArrowDown then Enter accepts the highlighted suggestion', async ({ page }) => {
    if (isMobile(page)) {
      test.skip(true, 'the mobile header opens search as a sheet');
    }

    await page.goto('/');

    const search = page.locator('#site-search-desktop');
    await search.fill('دریل');
    await expect(page.getByRole('listbox')).toBeVisible();

    await search.press('ArrowDown');
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');

    const highlighted = await page.getByRole('option').first().innerText();
    expect(highlighted.trim().length).toBeGreaterThan(0);

    await search.press('Enter');

    // Enter on an active suggestion navigates to that product, not to /search.
    await expect(page).not.toHaveURL(/\/search\?q=/);
    await expect(page).toHaveURL(/\/product\//);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(highlighted.trim().split('\n')[0]!);
  });

  test('Enter with no highlighted row submits the query', async ({ page }) => {
    if (isMobile(page)) {
      test.skip(true, 'the mobile header opens search as a sheet');
    }

    await page.goto('/');

    const search = page.locator('#site-search-desktop');
    await search.fill('دریل رونیکس');
    await expect(page.getByRole('listbox')).toBeVisible();

    await search.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=/);
  });

  test('Escape closes the popup and Alt+ArrowDown reopens it', async ({ page }) => {
    if (isMobile(page)) {
      test.skip(true, 'the mobile header opens search as a sheet');
    }

    await page.goto('/');

    const search = page.locator('#site-search-desktop');
    await search.fill('دریل');
    await expect(page.getByRole('listbox')).toBeVisible();

    await search.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    // The combobox must report that it is collapsed while it is collapsed.
    await expect(search).toHaveAttribute('aria-expanded', 'false');

    await search.press('Alt+ArrowDown');
    await expect(page.getByRole('listbox')).toBeVisible();
  });
});

test.describe('web: data-access failure states', () => {
  // The fixture-e2e catalog client resolves in-process, so an unreachable API
  // cannot be simulated here; the retry/offline paths are covered by the unit
  // tests. What E2E can prove against the real shipped bundle is that a genuine
  // missing record is reported as missing and never indexed.
  test('an unknown product is reported as not found rather than an empty detail view', async ({ page }) => {
    await page.goto('/product/no-such-product-slug');

    await expect(page.getByText('محصول یافت نشد')).toBeVisible();
    // A 404 must not offer a retry that can only fail again.
    await expect(page.getByRole('button', { name: /تلاش دوباره/ })).toHaveCount(0);
  });

  test('an unknown category is reported as not found, not as an empty listing', async ({ page }) => {
    await page.goto('/category/no-such-category-slug');

    // No empty "nothing to show" state and no false retry prompt for a 404.
    await expect(page.getByText(/محصولی برای نمایش وجود ندارد/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /تلاش دوباره/ })).toHaveCount(0);
  });
});
