import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174'

test('web: real homepage artwork, slider controls and mobile tracking entry', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(origin)
  const slider = page.getByRole('region', { name: 'پیشنهادهای فروشگاه' })
  await expect(slider.getByRole('link', { name: 'مشاهده کالاها' })).toHaveAttribute('href', '/search')
  await expect(slider.locator('img')).toHaveJSProperty('complete', true)
  await expect(slider.locator('img')).not.toHaveJSProperty('naturalWidth', 0)
  await slider.getByRole('button', { name: 'اسلاید بعدی' }).click()
  await expect(slider.getByRole('heading', { name: 'انتخاب ابزار برای پروژهٔ شما' })).toBeVisible()
  await slider.getByRole('button', { name: 'نمایش اسلاید 3' }).click()
  await expect(slider.getByRole('link', { name: 'پیگیری سفارش‌ها' })).toHaveAttribute('href', '/orders')
  await expect(slider.getByRole('button', { name: 'شروع پخش خودکار' })).toHaveCount(0)
  const audit = await new AxeBuilder({ page }).include('[aria-label="پیشنهادهای فروشگاه"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  if (isMobile) {
    const nav = page.getByRole('navigation', { name: 'ناوبری پایین' })
    await nav.getByRole('button', { name: 'پیگیری سفارش‌ها' }).click()
    await expect(page).toHaveURL(`${origin}/orders`)
    await expect(nav.getByRole('button', { name: 'پیگیری سفارش‌ها' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'برای مشاهده سفارش‌ها وارد شوید' })).toBeVisible()
    expect(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth)).toBe(true)
  }
})
