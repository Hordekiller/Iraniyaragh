import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const realWebUrl = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174'

// Real storefront build: fixture auth/catalog OFF. These public routes do not
// imply provider/handset acceptance or fabricate an authenticated customer.
test('web: legal pages and customer entry points work with fixtures disabled', async ({ page }) => {
  await page.goto(`${realWebUrl}/privacy`)
  await expect(page.getByRole('heading', { level: 1, name: 'حریم خصوصی' })).toBeVisible()
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByText(/سبد مهمان در سامانهٔ فروشگاه نگهداری/)).toBeVisible()
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${realWebUrl}/privacy`)
  await page.getByRole('main').getByRole('link', { name: 'قوانین و شرایط فروش' }).click()
  await expect(page).toHaveURL(`${realWebUrl}/terms`)
  await expect(page.getByRole('heading', { level: 1, name: 'قوانین و شرایط فروش' })).toBeVisible()
  await expect(page.getByText(/ثبت سفارش به معنی پرداخت نیست/)).toBeVisible()
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(a11y.violations.filter((item) => item.impact === 'critical' || item.impact === 'serious')).toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'قوانین و شرایط فروش' })).toBeVisible()
  for (const [path, heading] of [
    ['/account', 'وارد حساب کاربری شوید'],
    ['/account/addresses', 'برای مدیریت نشانی‌ها وارد شوید'],
    ['/account/security', 'برای مشاهده امنیت حساب وارد شوید'],
  ]) {
    await page.goto(`${realWebUrl}${path}`)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow')
  }
  await page.getByRole('contentinfo').getByRole('link', { name: 'حریم خصوصی' }).click()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow')
})
