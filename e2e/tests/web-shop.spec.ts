import { expect, test } from '@playwright/test'

test.describe('web: dedicated shop fixture journeys', () => {
  test('renders the shop and catalog without horizontal overflow at supported widths', async ({ page }) => {
    await page.goto('/shop')
    await expect(page.getByRole('heading', { level: 1, name: 'فروشگاه ایرانی یراق' })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('پیش‌نمایش دمو')
    for (const width of [320, 360, 390, 430, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `shop at ${width}px`).toBeLessThanOrEqual(width)
    }
    await page.getByRole('link', { name: 'همهٔ کالاها' }).first().click()
    await expect(page).toHaveURL(/\/catalog$/u)
    await page.goBack()
    await expect(page).toHaveURL(/\/shop$/u)
    await expect(page.getByRole('heading', { level: 1, name: 'فروشگاه ایرانی یراق' })).toBeVisible()
  })

  test('keeps shop navigation across account and orders and returns to the main site', async ({ page }) => {
    await page.goto('/shop')
    await page.waitForFunction(() => sessionStorage.getItem('iranyaragh:navigation-mode') === 'shop')
    await page.goto('/account')
    await expect(page.getByRole('link', { name: 'بازگشت به سایت اصلی' })).toBeVisible()
    await page.goto('/orders')
    await expect(page.getByRole('link', { name: 'بازگشت به سایت اصلی' })).toBeVisible()
    await page.getByRole('link', { name: 'بازگشت به سایت اصلی' }).click()
    await expect(page).toHaveURL(/\/$/u, { timeout: 15_000 })
    await expect(page.getByRole('link', { name: 'بازگشت به سایت اصلی' })).toHaveCount(0)
  })

  test('persists a guest wishlist item across navigation and reload', async ({ page }) => {
    await page.goto('/shop')
    await page.getByRole('heading', { name: 'پیشنهادهای ویژه' }).scrollIntoViewIfNeeded()
    const add = page.getByRole('button', { name: /^افزودن به علاقه‌مندی‌ها:/u }).first()
    await add.scrollIntoViewIfNeeded()
    const productName = (await add.getAttribute('aria-label'))!.split(': ')[1]!
    await add.click()
    await expect(page.getByRole('button', { name: `حذف از علاقه‌مندی‌ها: ${productName}` }).first()).toHaveAttribute('aria-pressed', 'true')
    await page.goto('/wishlist')
    await expect(page.getByRole('heading', { level: 1, name: 'علاقه‌مندی‌ها' })).toBeVisible()
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible()
    await page.reload()
    await expect(page.locator('a[href^="/products/"]').first()).toBeVisible()
  })
})
