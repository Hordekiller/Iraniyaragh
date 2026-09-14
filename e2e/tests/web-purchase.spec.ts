import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createExternalRequestsTracker, tap } from './helpers';

async function addFirstProduct(page: Page) {
  await page.goto('/');
  await tap(page.locator('section#popular a[class*="snap-start"]').first());
  await expect(page.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeVisible();
  await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }));
  await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible();
}

test.describe('web: fixture purchase journey', () => {
  test('adds a product, validates Iranian checkout data and completes test payment', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await addFirstProduct(page);
    await page.goto('/cart');
    await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible();
    await tap(page.getByRole('link', { name: 'ادامه فرایند خرید' }));
    await expect(page.getByRole('heading', { name: 'تکمیل سفارش' })).toBeVisible();

    await tap(page.getByRole('button', { name: 'ثبت سفارش و پرداخت' }));
    await expect(page.getByText('نام و نام خانوادگی را وارد کنید')).toBeVisible();
    await expect(page.getByText('شماره موبایل معتبر (۱۱ رقم، شروع با ۰۹) وارد کنید')).toBeVisible();
    await expect(page.getByText('کد پستی ۱۰ رقمی وارد کنید')).toBeVisible();

    await page.getByLabel('نام و نام خانوادگی').fill('علی رضایی');
    await page.getByLabel('شماره موبایل').fill('۰۹۱۲۳۴۵۶۷۸۹');
    await page.getByLabel('استان').selectOption({ label: 'تهران' });
    await page.getByLabel('شهر').fill('تهران');
    await page.getByLabel('کد پستی').fill('۱۲۳۴۵۶۷۸۹۰');
    await page.getByLabel('آدرس کامل').fill('خیابان ولیعصر، کوچه ابزار، پلاک ۱۰');
    await page.getByLabel('توضیحات (اختیاری)').fill('تحویل در ساعات کاری');
    await tap(page.getByRole('button', { name: 'ثبت سفارش و پرداخت' }));

    await expect(page.getByRole('heading', { name: 'درگاه پرداخت' })).toBeVisible();
    await tap(page.getByRole('button', { name: 'پرداخت موفق (تست)' }));
    await expect(page.getByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeVisible();
    await tap(page.getByRole('link', { name: 'مشاهده جزئیات سفارش' }));
    await expect(page.getByRole('heading', { name: /سفارش/ })).toBeVisible();
    await expect(page.getByText('توضیحات سفارش')).toBeVisible();
    await expect(page.getByText('تحویل در ساعات کاری')).toBeVisible();

    await network.assertNone();
  });

  test('keeps checkout form accessible across cart, checkout and orders routes', async ({ page }) => {
    await addFirstProduct(page);

    for (const route of ['/cart', '/checkout', '/orders']) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const criticalSerious = results.violations.filter(
        violation => violation.impact === 'critical' || violation.impact === 'serious',
      );
      expect(
        criticalSerious,
        `${route}: ${JSON.stringify(criticalSerious.map(violation => violation.help), null, 2)}`,
      ).toEqual([]);
    }
  });
});
