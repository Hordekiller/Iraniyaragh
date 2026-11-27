import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { isMobile, signInDiAsAdmin } from './helpers'

const api = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000'
const realWeb = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174'
const image = join(__dirname, 'fixtures', 'product-detail.png')

test('admin publishes an independent category image and shop slide without changing homepage hero', async ({ page, request }) => {
  test.skip(isMobile(page), 'The admin mutation is verified once on the desktop project.')
  const homepageBefore = await (await request.get(`${api}/api/v1/catalog/homepage-hero`)).json()
  await signInDiAsAdmin(page)
  await page.goto('/catalog/categories')
  await page.getByRole('button', { name: 'ویرایش ابزار دمو' }).click()
  const dialog = page.getByRole('dialog', { name: 'ویرایش دسته‌بندی' })
  await dialog.getByRole('textbox', { name: 'متن جایگزین تصویر' }).fill('تصویر ابزار دمو در فروشگاه')
  await dialog.locator('input[type="file"]').setInputFiles(image)
  await expect(dialog.getByText('تصویر آمادهٔ استفاده است.')).toBeVisible({ timeout: 60_000 })
  await dialog.getByRole('button', { name: 'ذخیرهٔ تغییرات' }).click()
  await expect(dialog).toHaveCount(0)

  const categoryResponse = await request.get(`${api}/api/v1/catalog/categories`)
  expect(categoryResponse.ok()).toBe(true)
  const categoryBody = await categoryResponse.json() as { data: { items: Array<{ id: string; image: { url: string } | null }> } }
  const category = categoryBody.data.items.find(item => item.id === 'seed_demo_category')
  expect(category?.image?.url).toContain('/renditions/')

  await page.goto('/settings/shop', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'مدیریت فروشگاه' })).toBeVisible()
  await page.getByRole('button', { name: 'افزودن اسلاید' }).click()
  await page.getByRole('textbox', { name: 'عنوان', exact: true }).fill('ابزار منتخب فروشگاه')
  await page.getByRole('textbox', { name: 'متن جایگزین تصویر' }).fill('ابزار منتخب فروشگاه')
  await page.getByRole('combobox', { name: 'تصویر دسکتاپ' }).click()
  await page.getByRole('listbox', { name: 'تصویر دسکتاپ' }).getByRole('option', { name: 'تصویر ابزار دمو در فروشگاه' }).first().click()
  await page.getByRole('switch', { name: 'انتشار فعال' }).check()
  await page.getByRole('button', { name: 'ذخیره و انتشار' }).click()
  await expect(page.getByText('تنظیمات فروشگاه ذخیره شد.')).toBeVisible()

  const shopResponse = await request.get(`${api}/api/v1/catalog/shop`)
  expect(shopResponse.ok()).toBe(true)
  const shopBody = await shopResponse.json() as { data: { config: { hero: Array<{ title: string }> } } }
  expect(shopBody.data.config.hero.some(item => item.title === 'ابزار منتخب فروشگاه')).toBe(true)
  expect(await (await request.get(`${api}/api/v1/catalog/homepage-hero`)).json()).toEqual(homepageBefore)

  await page.goto(`${realWeb}/shop`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('ابزار منتخب فروشگاه')).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(0)
})
