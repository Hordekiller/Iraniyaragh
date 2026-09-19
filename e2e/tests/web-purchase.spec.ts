import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import {
  createExternalRequestsTracker,
  isMobile,
  signInFixtureCustomer,
  tap,
} from './helpers'

async function addFirstProduct(page: Page) {
  await tap(page.locator('section#popular button[class*="snap-start"]').first())
  await expect(
    page.getByRole('button', { name: 'افزودن به سبد خرید' }),
  ).toBeVisible()
  await tap(page.getByRole('button', { name: 'افزودن به سبد خرید' }))
  await expect(page.getByText('به سبد خرید افزوده شد')).toBeVisible()
}

test.describe('web: fixture purchase journey', () => {
  test('creates a pending-payment order without simulating a successful payment', async ({
    page,
  }) => {
    const network = createExternalRequestsTracker(page)

    await signInFixtureCustomer(page)
    await addFirstProduct(page)
    await tap(page.getByRole('link', { name: /سبد خرید،/ }).first())
    await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible()
    await tap(page.getByRole('link', { name: 'ادامه فرایند خرید' }))
    await expect(
      page.getByRole('heading', { name: 'آدرس و روش ارسال' }),
    ).toBeVisible()

    await tap(page.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    await expect(page.getByText('نام تحویل‌گیرنده را وارد کنید.')).toBeVisible()
    await expect(
      page.getByText('شماره موبایل معتبر ۱۱ رقمی وارد کنید.'),
    ).toBeVisible()
    await expect(
      page.getByText('کد پستی معتبر ۱۰ رقمی وارد کنید.'),
    ).toBeVisible()

    await page.getByLabel('نام تحویل‌گیرنده').fill('علی رضایی')
    await page.getByLabel('شماره موبایل').fill('۰۹۱۲۳۴۵۶۷۸۹')
    await page.getByLabel('استان').selectOption({ label: 'تهران' })
    await page.getByLabel('شهر').fill('تهران')
    await page.getByLabel('کد پستی').fill('۱۲۳۴۵۶۷۸۹۰')
    await page
      .getByLabel('نشانی کامل')
      .fill('خیابان ولیعصر، کوچه ابزار، پلاک ۱۰')
    await tap(page.getByRole('button', { name: 'محاسبه هزینه ارسال' }))
    await expect(
      page.getByRole('radio', { name: /ارسال استاندارد/ }),
    ).toBeChecked()
    await tap(page.getByRole('button', { name: 'ثبت سفارش' }))

    await expect(
      page.getByRole('heading', { name: 'سفارش در انتظار پرداخت است' }),
    ).toBeVisible()
    await expect(page.getByText(/هیچ پرداختی موفق فرض نمی‌شود/)).toBeVisible()
    await tap(page.getByRole('link', { name: 'جزئیات سفارش' }))
    await expect(
      page.getByRole('heading', { level: 1, name: /^سفارش DEV-/ }),
    ).toBeVisible()
    await expect(page.getByText('پرداختی آغاز نشده')).toBeVisible()

    await network.assertNone()
  })

  test('keeps checkout form accessible across cart, checkout and orders routes', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    await signInFixtureCustomer(page)
    await addFirstProduct(page)

    await tap(page.getByRole('link', { name: /سبد خرید،/ }).first())
    for (const route of ['/cart', '/checkout', '/orders']) {
      if (route === '/checkout') {
        await tap(page.getByRole('link', { name: 'ادامه فرایند خرید' }))
      }
      if (route === '/orders') {
        if (isMobile(page)) {
          await tap(
            page
              .getByRole('navigation', { name: 'ناوبری پایین' })
              .getByRole('button', { name: 'حساب کاربری' }),
          )
          await tap(page.getByRole('link', { name: /سفارش‌های من/ }))
        } else {
          await tap(page.getByRole('link', { name: 'پیگیری سفارش' }))
        }
      }
      await expect(page).toHaveURL(new RegExp(`${route}$`))
      await page.waitForLoadState('networkidle')
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const criticalSerious = results.violations.filter(
        (violation) =>
          violation.impact === 'critical' || violation.impact === 'serious',
      )
      expect(
        criticalSerious,
        `${route}: ${JSON.stringify(
          criticalSerious.map((violation) => violation.help),
          null,
          2,
        )}`,
      ).toEqual([])
    }
  })
})
