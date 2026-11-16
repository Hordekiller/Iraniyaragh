import { expect, test } from '@playwright/test'

test('public analytics stays off until the visitor chooses, then rejection persists', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.removeItem('iraniyaragh_analytics_consent'))
  await page.reload()

  const choice = page.getByRole('dialog', { name: 'انتخاب آمار بازدید' })
  await expect(choice).toBeVisible()
  await expect(page.locator('#iraniyaragh-ga4')).toHaveCount(0)

  await choice.getByRole('button', { name: 'رد می‌کنم' }).click()
  await expect(choice).toHaveCount(0)
  await page.reload()
  await expect(choice).toHaveCount(0)
  await expect(page.locator('#iraniyaragh-ga4')).toHaveCount(0)
})
