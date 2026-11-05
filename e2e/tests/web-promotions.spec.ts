import { expect, test, type Page } from '@playwright/test';
import { signInFixtureCustomer, tap } from './helpers';

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile 375', width: 375, height: 812 },
  { name: 'large mobile 430', width: 430, height: 932 },
];

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`coupon box in the cart is RTL, accessible and truthful at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await signInFixtureCustomer(page);
    await tap(page.getByRole('link', { name: /دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰/ }).first());
    await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }));
    await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible();
    await tap(page.getByRole('link', { name: /سبد خرید،/ }).first());
    await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible();
    expect(await page.locator('html').getAttribute('dir')).toBe('rtl');

    const input = page.getByRole('textbox', { name: /کد تخفیف/ });
    await expect(input).toBeVisible();
    await input.fill('SAVE10');
    await tap(page.getByRole('button', { name: /اعمال/ }));
    // The offline fixture backend has no promotion engine: it must refuse, never fake a discount.
    await expect(page.getByRole('alert').or(page.getByText(/تأیید نشد|معتبر نیست|پشتیبانی/)).first()).toBeVisible();
    await expect(page.getByText(/تخفیف کد/)).toHaveCount(0);
    await noOverflow(page);
  });
}
