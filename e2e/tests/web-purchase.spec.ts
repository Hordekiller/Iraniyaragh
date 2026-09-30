import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createExternalRequestsTracker, isMobile, tap } from './helpers';

const MOBILE = '09123456789';
const VALID_CODE = '123456';

async function signIn(page: Page) {
  if (isMobile(page)) {
    await tap(
      page
        .getByRole('navigation', { name: 'ناوبری پایین' })
        .getByRole('button', { name: 'حساب کاربری' }),
    );
  } else {
    await tap(page.getByRole('button', { name: 'ورود به حساب کاربری' }));
  }
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('#login-mobile').fill(MOBILE);
  await tap(page.getByRole('button', { name: 'دریافت کد تایید', exact: true }));
  await page.locator('#login-otp-code').fill(VALID_CODE);
  await tap(page.getByRole('button', { name: 'ورود به حساب', exact: true }));
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function addFirstProduct(page: Page) {
  await tap(page.locator('section#newest button[class*="snap-start"]').first());
  await expect(page.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeVisible();
  await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }));
  await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible();
}

test.describe('web: fixture purchase journey', () => {
  test('signs in, validates Iranian checkout data and creates a pending-payment order', async ({ page }) => {
    const network = createExternalRequestsTracker(page);

    await page.goto('/');
    await addFirstProduct(page);
    // The session is memory-only (AUTH_CONTRACT §7), so every step after sign-in
    // must stay within the SPA; a full navigation would drop the session.
    await signIn(page);

    await tap(page.getByRole('link', { name: /سبد خرید/ }).first());
    await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible();
    await tap(page.getByRole('link', { name: 'ادامه فرایند خرید' }));
    await expect(page.getByRole('heading', { name: 'تکمیل سفارش' })).toBeVisible();

    await tap(page.getByRole('button', { name: 'ادامه و محاسبه ارسال' }));
    // The summary deliberately repeats the field messages, so each message is
    // asserted against the element that is wired to its control via
    // aria-describedby rather than by text.
    await expect(page.locator('#full-name-error')).toHaveText('نام و نام خانوادگی را وارد کنید');
    await expect(page.locator('#mobile-error')).toHaveText('شماره موبایل معتبر (۱۱ رقم، شروع با ۰۹) وارد کنید');
    await expect(page.locator('#postal-code-error')).toHaveText('کد پستی ۱۰ رقمی وارد کنید');
    // WCAG 3.3.1/3.3.3: the summary says what is wrong, and the caret lands on
    // the first invalid control instead of staying on the submit button.
    await expect(page.getByRole('alert')).toContainText('فیلد نیاز به اصلاح دارد');
    await expect(page.getByLabel('نام و نام خانوادگی')).toBeFocused();
    await expect(page.getByLabel('نام و نام خانوادگی')).toHaveAttribute('aria-invalid', 'true');

    await page.getByLabel('نام و نام خانوادگی').fill('علی رضایی');
    await page.getByLabel('شماره موبایل').fill('۰۹۱۲۳۴۵۶۷۸۹');
    await page.getByLabel('استان').selectOption({ label: 'تهران' });
    await page.getByLabel('شهر').fill('تهران');
    await page.getByLabel('کد پستی').fill('۱۲۳۴۵۶۷۸۹۰');
    await page.getByLabel('آدرس کامل').fill('خیابان ولیعصر، کوچه ابزار، پلاک ۱۰');
    await tap(page.getByRole('button', { name: 'ادامه و محاسبه ارسال' }));

    await expect(page.getByText('روش ارسال')).toBeVisible();
    await tap(page.getByRole('button', { name: 'ثبت نهایی سفارش' }));

    // Honest handoff: no gateway is wired, so the order stays awaiting payment.
    await expect(page.getByRole('heading', { name: 'در انتظار پرداخت' })).toBeVisible();
    await expect(page.getByText('مهلت رزرو')).toBeVisible();
    await expect(page.getByRole('button', { name: /تجدید وضعیت/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeHidden();

    await tap(page.getByRole('link', { name: 'مشاهده جزئیات سفارش' }).first());
    // Level 1: the detail page also renders the «پیگیری سفارش» section heading.
    await expect(page.getByRole('heading', { level: 1, name: /سفارش/ })).toBeVisible();
    await expect(page.getByText('اقلام سفارش')).toBeVisible();
    await expect(page.getByText('وضعیت پرداخت و ارسال')).toBeVisible();

    await network.assertNone();
  });

  test('keeps cart, checkout and orders accessible', async ({ page }) => {
    await page.goto('/');
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
