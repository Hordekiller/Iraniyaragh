import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { createExternalRequestsTracker, isMobile, tap } from './helpers'

const PRODUCT = '/products/ronix-2210-hammer-drill'
const UNIT_TOMAN = 2_850_000

const toman = (amount: number) =>
  `${amount.toLocaleString('en-US').replaceAll(',', '٬').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)])} تومان`

const quantityField = (page: Page) => page.getByRole('textbox', { name: /^تعداد محصول/ })

async function typeQuantity(page: Page, field: Locator, text: string) {
  await field.click()
  // Focus selects the current number, so typing replaces it without clearing first.
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

async function addQuantity(page: Page, text: string) {
  await page.goto(PRODUCT)
  const add = page.getByRole('button', { name: 'افزودن به سبد خرید' })
  await expect(add).toBeEnabled()
  await typeQuantity(page, quantityField(page), text)
  await tap(add)
  await expect(page.getByText(/به سبد خرید افزوده شد/)).toBeVisible()
}

async function openCart(page: Page) {
  await tap(page.getByRole('button', { name: 'مشاهده سبد' }))
  await expect(page.getByRole('heading', { name: 'سبد خرید' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function expectSideBySide(page: Page) {
  const group = page.getByRole('group', { name: /^تعداد/ }).first()
  const boxes = await Promise.all(
    [group.getByRole('button').first(), group.getByRole('textbox'), group.getByRole('button').last()].map(
      async (item) => (await item.boundingBox())!,
    ),
  )
  const viewport = page.viewportSize()!
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.height).toBeGreaterThanOrEqual(36)
  }
  const sorted = [...boxes].sort((a, b) => a.x - b.x)
  expect(sorted[0].x + sorted[0].width).toBeLessThanOrEqual(sorted[1].x)
  expect(sorted[1].x + sorted[1].width).toBeLessThanOrEqual(sorted[2].x)
}

test.describe('web: direct quantity entry', () => {
  test('buys 100 units by typing the number once', async ({ page }) => {
    const network = createExternalRequestsTracker(page)
    await addQuantity(page, '100')
    await expect(quantityField(page)).toHaveValue('۱۰۰')
    await openCart(page)
    await expect(quantityField(page)).toHaveValue('۱۰۰')
    await expect(page.getByText(toman(UNIT_TOMAN * 100)).first()).toBeVisible()
    await network.assertNone()
  })

  test('exposes numeric-keyboard attributes and a 16px field', async ({ page }) => {
    await page.goto(PRODUCT)
    const field = quantityField(page)
    await expect(field).toHaveAttribute('inputmode', 'numeric')
    await expect(field).toHaveAttribute('type', 'text')
    await expect(field).toHaveAttribute('pattern', /0-9/)
    const fontSize = await field.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))
    expect(fontSize).toBeGreaterThanOrEqual(16)
  })

  test('accepts Persian and Arabic digits and recalculates the price', async ({ page }) => {
    await addQuantity(page, '۱۲۵')
    await openCart(page)
    await expect(page.getByText(toman(UNIT_TOMAN * 125)).first()).toBeVisible()
    const field = quantityField(page)
    await typeQuantity(page, field, '١٠')
    await expect(field).toHaveValue('۱۰')
    await expect(page.getByText(toman(UNIT_TOMAN * 10)).first()).toBeVisible()
  })

  test('replaces the selected number and keeps plus and minus in step', async ({ page }) => {
    await addQuantity(page, '20')
    await openCart(page)
    const field = quantityField(page)
    await typeQuantity(page, field, '250')
    await expect(field).toHaveValue('۲۵۰')
    await expect(page.getByText(toman(UNIT_TOMAN * 250)).first()).toBeVisible()
    await tap(page.getByRole('button', { name: /^افزایش تعداد/ }))
    await expect(field).toHaveValue('۲۵۱')
    await expect(page.getByRole('button', { name: /^کاهش تعداد/ })).toBeEnabled()
    await tap(page.getByRole('button', { name: /^کاهش تعداد/ }))
    await expect(field).toHaveValue('۲۵۰')
  })

  test('refuses letters and zero, and accepts bulk quantities above 1000', async ({ page }) => {
    await addQuantity(page, '5')
    await openCart(page)
    const field = quantityField(page)
    await field.click()
    await page.keyboard.type('a')
    await expect(page.getByText('فقط عدد صحیح وارد کنید.')).toBeVisible()
    await expect(field).toHaveValue('۵')
    await field.blur()

    await typeQuantity(page, field, '0')
    await expect(page.getByText('حداقل تعداد ۱ عدد است.')).toBeVisible()
    await expect(field).toHaveValue('۵')

    await typeQuantity(page, field, '25000')
    await expect(field).toHaveValue('۲۵۰۰۰')
    await expect(page.getByText(toman(UNIT_TOMAN * 25000)).first()).toBeVisible()
  })

  test('works from the keyboard alone', async ({ page }) => {
    test.skip(isMobile(page), 'hardware keyboard flow')
    await addQuantity(page, '3')
    await openCart(page)
    const field = quantityField(page)
    await field.focus()
    await page.keyboard.type('77')
    await page.keyboard.press('Tab')
    await expect(field).toHaveValue('۷۷')
    await expect(field).not.toBeFocused()
    await field.focus()
    await page.keyboard.press('ArrowUp')
    await expect(field).toHaveValue('۷۸')
  })

  test('keeps the selector usable without overflow at phone widths', async ({ page }) => {
    test.skip(!isMobile(page), 'phone layout')
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(PRODUCT)
      await expect(quantityField(page)).toBeVisible()
      await expectNoHorizontalOverflow(page)
      await expectSideBySide(page)
      await expect(page.getByRole('button', { name: 'افزودن به سبد خرید' })).toBeInViewport()
    }
    await addQuantity(page, '1000')
    await expect(quantityField(page)).toHaveValue('۱۰۰۰')
    await expect(quantityField(page)).toBeInViewport()
    await expectSideBySide(page)
    await openCart(page)
    await expectNoHorizontalOverflow(page)
    await expectSideBySide(page)
  })

  test('keeps quantity, add and view-cart on one row on common phones', async ({ page }) => {
    test.skip(!isMobile(page), 'phone layout')
    for (const width of [360, 390, 412]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(PRODUCT)
      const add = page.getByRole('button', { name: 'افزودن به سبد خرید' })
      await expect(add).toBeEnabled()
      const row = await Promise.all(
        [page.getByRole('group', { name: /^تعداد/ }), add, page.getByRole('button', { name: 'مشاهده سبد' })].map(
          async (item) => (await item.boundingBox())!,
        ),
      )
      const centres = row.map((box) => box.y + box.height / 2)
      expect(Math.max(...centres) - Math.min(...centres), `one row at ${width}px`).toBeLessThan(8)
      await expectNoHorizontalOverflow(page)
    }
    // The narrowest phones may wrap the label, but never clip it.
    for (const width of [320, 360, 412]) {
      await page.setViewportSize({ width, height: 800 })
      const label = page.getByRole('button', { name: 'افزودن به سبد خرید' }).locator('span').first()
      const clipped = await label.evaluate((node) => {
        const button = node.parentElement!.getBoundingClientRect()
        const text = node.getBoundingClientRect()
        return text.left < button.left - 1 || text.right > button.right + 1 || text.height > button.height
      })
      expect(clipped, `label clipped at ${width}px`).toBe(false)
    }
  })

  test('lets the end of the cart scroll clear of the help button', async ({ page }) => {
    test.skip(!isMobile(page), 'floating help button is mobile-only')
    // The fixture build has no API; answer the admin helper switch as "on".
    await page.route('**/api/v1/catalog/storefront-helper', (route) =>
      route.fulfill({
        json: { data: { enabled: true } },
        headers: {
          'access-control-allow-origin': new URL(page.url() || 'http://127.0.0.1:4173').origin,
          'access-control-allow-credentials': 'true',
        },
      }),
    )
    await addQuantity(page, '3')
    await openCart(page)
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const helpButton = page.getByRole('button', { name: 'راهنمای این صفحه' })
    await expect(helpButton).toBeVisible()
    const help = await helpButton.boundingBox()
    const summaryEnd = await page.getByRole('complementary').evaluate((node) => node.getBoundingClientRect().bottom)
    expect(help).not.toBeNull()
    expect(summaryEnd).toBeLessThanOrEqual(help!.y)
  })

  test('has no accessibility violations in the selector', async ({ page }) => {
    await addQuantity(page, '12')
    await openCart(page)
    const results = await new AxeBuilder({ page })
      .include('[aria-label="اقلام سبد خرید"]')
      .analyze()
    expect(results.violations).toEqual([])
  })
})
