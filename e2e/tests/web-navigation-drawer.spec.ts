import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const origin = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174'
// Browser-only catalog responses: never connect these fixtures to a sales database.
const categories = [
  { id: 'test-power', parentId: null, name: 'ابزار برقی', slug: 'test-power', productCount: 0 },
  { id: 'test-hand', parentId: null, name: 'ابزار دستی', slug: 'test-hand', productCount: 0 },
  { id: 'test-drills', parentId: 'test-power', name: 'دریل و پیچ‌گوشتی', slug: 'test-drills', productCount: 0 },
  { id: 'test-cordless', parentId: 'test-drills', name: 'دریل شارژی', slug: 'test-cordless', productCount: 0 },
  { id: 'test-saws', parentId: 'test-power', name: 'اره برقی', slug: 'test-saws', productCount: 0 },
]

async function mockCatalog(page: Page, failCategories = false, empty = false) {
  let fail = failCategories
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/v1/catalog/categories') {
      if (fail) return route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE' } })
      return route.fulfill({ json: { data: { items: empty ? [] : categories } } })
    }
    if (pathname === '/api/v1/catalog/homepage-collections') return route.fulfill({ json: { data: { config: { version: 1, updatedAt: null, sections: [] } } } })
    if (pathname === '/api/v1/catalog/products') return route.fulfill({ json: { data: { items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } } } })
    return route.abort()
  })
  return () => { fail = false }
}

test('web: drawer supports nested discovery, search, navigation and accessible modal focus', async ({ page, isMobile }, testInfo) => {
  await mockCatalog(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(origin)
  // The newsletter ends the homepage; no catalog/brand list is appended below it.
  const newsletter = page.getByRole('region', { name: 'خبرنامه هنوز فعال نیست' })
  await expect(newsletter.locator('xpath=following-sibling::*')).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'باز کردن منوی فروشگاه' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'منوی فروشگاه' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'دریل شارژی', exact: true })).toHaveAttribute('href', '/categories/test-cordless')
  await expect(dialog.getByRole('button', { name: 'بستن منوی فروشگاه' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('link', { name: 'حریم خصوصی' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'بستن منوی فروشگاه' })).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')

  if (isMobile) await dialog.getByLabel('انتخاب دسته اصلی').selectOption('test-hand')
  else await dialog.getByRole('button', { name: /ابزار دستی/ }).click()
  await expect(dialog.getByRole('region', { name: 'دسته ابزار دستی' })).toBeVisible()
  await dialog.getByRole('searchbox', { name: 'جستجو در دسته‌بندی‌ها' }).fill('شارژي')
  await expect(dialog.getByRole('link', { name: 'دریل شارژی', exact: true })).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'اره برقی', exact: true })).toHaveCount(0)
  await dialog.getByRole('searchbox').fill('پیدا نمی‌شود')
  await expect(dialog.getByRole('status')).toContainText('دسته‌ای با این نام پیدا نشد')
  await expect(dialog.getByRole('navigation', { name: 'صفحه‌های فروشگاه' })).toBeVisible()
  await dialog.getByRole('searchbox').fill('')
  await expect(dialog.getByRole('region', { name: 'دسته ابزار دستی' })).toBeVisible()

  const audit = await new AxeBuilder({ page }).include('#store-navigation').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('navigation-drawer.png'), fullPage: false })

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await trigger.click()
  await dialog.getByRole('link', { name: /سفارش‌های من/ }).click()
  await expect(page).toHaveURL(`${origin}/orders`)
  await expect(dialog).toHaveCount(0)
})

test('web: category failures remain explicit and recover through retry', async ({ page }) => {
  const recover = await mockCatalog(page, true)
  await page.goto(origin)
  await page.getByRole('button', { name: 'باز کردن منوی فروشگاه' }).click()
  const dialog = page.getByRole('dialog', { name: 'منوی فروشگاه' })
  await expect(dialog.getByRole('alert')).toContainText('دسته‌بندی‌ها دریافت نشدند')
  await expect(dialog.getByRole('link', { name: 'دریل شارژی', exact: true })).toHaveCount(0)
  recover()
  await dialog.getByRole('button', { name: 'تلاش دوباره' }).click()
  await expect(dialog.getByRole('link', { name: 'دریل شارژی', exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'بستن منوی فروشگاه' }).click()
  await expect(dialog).toHaveCount(0)
})

test('web: empty categories preserve page navigation and desktop backdrop dismissal', async ({ page, isMobile }) => {
  await mockCatalog(page, false, true)
  await page.goto(origin)
  await page.getByRole('button', { name: 'باز کردن منوی فروشگاه' }).click()
  const dialog = page.getByRole('dialog', { name: 'منوی فروشگاه' })
  await expect(dialog.getByRole('status')).toContainText('هنوز دسته‌بندی منتشرشده‌ای وجود ندارد')
  await expect(dialog.getByRole('link', { name: /همه کالاها/ })).toBeVisible()
  if (!isMobile) {
    await page.mouse.click(20, 100)
    await expect(dialog).toHaveCount(0)
  }
})

test('web: drawer fits small phones, landscape and tablets without horizontal overflow', async ({ page }) => {
  await mockCatalog(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(origin)
  for (const viewport of [{ width: 320, height: 640 }, { width: 812, height: 375 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'باز کردن منوی فروشگاه' }).click()
    const dialog = page.getByRole('dialog', { name: 'منوی فروشگاه' })
    await expect(dialog.getByRole('link', { name: 'دریل شارژی', exact: true })).toBeVisible()
    expect(await dialog.evaluate(element => element.scrollWidth <= innerWidth)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dialog.getByRole('button', { name: 'بستن منوی فروشگاه' }).click()
    await expect(dialog).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'باز کردن منوی فروشگاه' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'دریل شارژی', exact: true }).click()
  await expect(page).toHaveURL(`${origin}/categories/test-cordless`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('web: mobile categories button opens its own page and supports nested discovery', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'The bottom navigation is visible on mobile.')
  // SSR reads its initial taxonomy before browser routes can intercept fetches.
  // Use the separately built, explicitly isolated fixture storefront here.
  const categoryOrigin = process.env.WEB_E2E_URL ?? 'http://127.0.0.1:4173'
  await page.goto(categoryOrigin)
  const navigation = page.getByRole('navigation', { name: 'ناوبری پایین' })
  await navigation.getByRole('button', { name: /دسته‌بندی‌ها/ }).click()
  await expect(page).toHaveURL(`${categoryOrigin}/categories`)
  await expect(page.getByRole('heading', { name: 'دسته‌بندی کالاها', level: 1 })).toBeVisible()
  await expect(navigation.getByRole('button', { name: /دسته‌بندی‌ها/ })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const firstCategory = page.locator('main article').first().getByRole('link').first()
  await expect(firstCategory).toBeVisible()
  const categoryName = await firstCategory.innerText()
  const categoryHref = await firstCategory.getAttribute('href')
  await page.screenshot({ path: testInfo.outputPath('categories-page.png') })
  const audit = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.getByRole('searchbox', { name: 'جستجو در دسته‌بندی کالاها' }).fill(categoryName.trim())
  await page.locator('main article').first().getByRole('link').first().click()
  await expect(page).toHaveURL(`${categoryOrigin}${categoryHref}`)
  await navigation.getByRole('button', { name: /دسته‌بندی‌ها/ }).click()
  await expect(page).toHaveURL(`${categoryOrigin}/categories`)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'دسته‌بندی کالاها', level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
