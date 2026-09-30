import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { isMobile } from './helpers';

test.describe('web: a11y baseline (#82)', () => {
  test('homepage has no critical or serious axe violations on desktop', async ({ page }) => {
    test.skip(isMobile(page), 'desktop viewshed');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious).toEqual([]);
  });

  test('homepage has no critical or serious axe violations on mobile', async ({ page }) => {
    test.skip(!isMobile(page), 'mobile viewshed');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const criticalSerious = results.violations.filter(
      v => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(criticalSerious, JSON.stringify(criticalSerious.map(v => v.help), null, 2)).toEqual([]);
  });

  test('a visible-on-focus skip link jumps to the main landmark', async ({ page }) => {
    await page.goto('/');

    const skip = page.getByRole('link', { name: 'پرش به محتوای اصلی' });
    await expect(skip).not.toBeInViewport();

    await page.keyboard.press('Tab');
    await expect(skip).toBeInViewport();

    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeInViewport();
  });

  test('every storefront link points at a real fragment target', async ({ page }) => {
    await page.goto('/');

    const placeholder = page.locator('a[href="#"]');
    await expect(placeholder).toHaveCount(0);

    const fragmentLinks = page.locator('a[href^="#"]');
    const count = await fragmentLinks.count();
    for (let i = 0; i < count; i += 1) {
      const href = await fragmentLinks.nth(i).getAttribute('href');
      await expect(page.locator(href as string)).toHaveCount(1);
    }
  });

  test('primary navigation entries are real routes, not home scroll anchors', async ({ page }) => {
    await page.goto('/');

    // The header nav is desktop-only, so the mobile viewshed is checked through
    // the footer, which carries the same destinations on every screen size.
    const scope = isMobile(page)
      ? page.getByRole('contentinfo')
      : page.getByRole('navigation', { name: 'ناوبری اصلی' });
    const entries: Array<[string, string]> = [
      ['دسته‌بندی', '/categories'],
      ['همه کالاها', '/products'],
      ['تازه‌های فروشگاه', '/newest'],
      ['خدمات', '/services'],
    ];

    for (const [name, href] of entries) {
      // A real destination, not `/#section` state navigation or a bare fragment.
      await expect(scope.getByRole('link', { name: new RegExp(name) }).first()).toHaveAttribute('href', href);
    }
  });

  test('storefront interactive cards are exposed as buttons', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('section#newest button[class*="snap-start"]').first()).toBeEnabled();
  });
});