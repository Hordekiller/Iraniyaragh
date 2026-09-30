/**
 * Responsive audit for the storefront shell.
 *
 * Walks the main customer routes at phone, tablet and desktop widths and
 * reports horizontal overflow, WCAG 2.5.8 tap-target failures, fixed-nav
 * overlap and console errors, then exercises the live search suggestions.
 *
 * Run against a served build:
 *   pnpm --filter @iranyaragh/web build:fixture-e2e
 *   pnpm --filter @iranyaragh/web preview --host 127.0.0.1 --port 4173
 *   pnpm --filter @iranyaragh/e2e audit:mobile
 */
/* global document, window, getComputedStyle */
import { chromium } from '@playwright/test'

const BASE = 'http://127.0.0.1:4173'
const WIDTHS = [
  { name: '360 (small phone)', width: 360, height: 780 },
  { name: '390 (iPhone)', width: 390, height: 844 },
  { name: '768 (tablet)', width: 768, height: 1024 },
  { name: '1440 (desktop)', width: 1440, height: 900 },
]
const ROUTES = [
  '/',
  '/products',
  '/search?q=دریل',
  '/category/power-tools',
  '/products/ronix-2210-hammer-drill',
  '/cart',
  '/checkout',
  '/account',
  '/orders',
  '/terms',
  '/privacy',
]

const problems = []
const note = (w, route, msg) => problems.push(`[${w.name} ${route}] ${msg}`)

const browser = await chromium.launch()
for (const vp of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.width < 768,
    hasTouch: vp.width < 768,
  })
  const page = await ctx.newPage()
  const consoleErrors = []
  page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()))
  page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`))

  for (const route of ROUTES) {
    consoleErrors.length = 0
    await page.goto(BASE + route, { waitUntil: 'networkidle' })
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(250)

    // 1. horizontal overflow
    const overflow = await page.evaluate(() => {
      const d = document.documentElement
      const widest = [...document.querySelectorAll('body *')]
        .filter(el => el.getBoundingClientRect().right > d.clientWidth + 1)
        .slice(0, 3)
        .map(el => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`)
      return { scroll: d.scrollWidth, client: d.clientWidth, widest }
    })
    if (overflow.scroll > overflow.client + 1) {
      note(vp, route, `horizontal overflow ${overflow.scroll}>${overflow.client} via ${overflow.widest.join(', ')}`)
    }

    // 2. tap targets (touch viewports only), with WCAG 2.5.8 exceptions
    if (vp.width < 768) {
      const small = await page.evaluate(() => {
        const SEL = 'a,button,input,[role="button"],[role="option"]'
        const all = [...document.querySelectorAll(SEL)]
          .filter(el => {
            const r = el.getBoundingClientRect()
            return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]')
          })
          .map(el => ({ el, r: el.getBoundingClientRect() }))
        const c = ({ left, top, width, height }) => [left + width / 2, top + height / 2]

        return all
          .filter(({ r }) => r.height < 24 || r.width < 24)
          .filter(({ el, r }) => {
            // Skip link: visually hidden until focused.
            if (el.className.includes('sr-only') || r.width < 4) return false
            // Inline exception: the box is set by the surrounding text line.
            if (el.closest('p,li span,[class*="prose"]')) return false
            // Breadcrumbs are an inline chain of text links.
            if (el.closest('nav[aria-label*="مسیر"],[aria-label*="breadcrumb"]')) return false
            // Spacing exception: no other target centre within 24px.
            const [x, y] = c(r)
            const tooClose = all.some(other => {
              if (other.el === el) return false
              const [ox, oy] = c(other.r)
              return Math.hypot(ox - x, oy - y) < 24
            })
            return tooClose
          })
          .slice(0, 4)
          .map(({ el, r }) =>
            `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`)
      })
      if (small.length) note(vp, route, `small tap targets: ${small.join(' | ')}`)
    }

    // 2b. the fixed bottom nav must not sit on top of the last footer content
    if (vp.width < 768) {
      const clearance = await page.evaluate(() => {
        const nav = [...document.querySelectorAll('nav')].find(n => getComputedStyle(n).position === 'fixed')
        if (!nav) return null
        const nr = nav.getBoundingClientRect()
        const content = [...document.querySelectorAll('footer *')]
          .filter(el => el.getBoundingClientRect().height > 0 && el.children.length === 0)
        if (content.length === 0) return null
        const lowest = Math.max(...content.map(el => el.getBoundingClientRect().bottom))
        return Math.round(nr.top - lowest)
      })
      if (clearance !== null && clearance < 0) {
        note(vp, route, `fixed bottom nav covers the last footer content by ${-clearance}px`)
      }
    }

    // 3. bottom nav present + not clipped
    const nav = page.locator('nav[aria-label*="اصلی"], nav[aria-label*="منوی"], nav:has-text("دسته‌بندی‌ها")').first()
    if (await nav.isVisible().catch(() => false)) {
      const box = await nav.boundingBox()
      if (box && box.y + box.height > vp.height + 1) note(vp, route, `bottom nav overflows viewport (bottom=${Math.round(box.y + box.height)} > ${vp.height})`)
    }

    // 4. console errors
    if (consoleErrors.length) note(vp, route, `console: ${consoleErrors.slice(0, 2).join(' | ')}`)
  }

  // 5. bottom nav active state on a real route
  await page.goto(BASE + '/orders', { waitUntil: 'networkidle' })
  const active = await page.evaluate(() => {
    const n = document.querySelector('nav a[aria-current="page"]')
    return n ? n.textContent.trim() : null
  })
  console.log(`  bottom-nav active on /orders: ${active ?? 'NONE'}`)

  await ctx.close()
}

// 6. live suggestions on mobile
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const m = await mctx.newPage()
await m.goto(BASE + '/', { waitUntil: 'networkidle' })
const toggle = m.getByRole('button', { name: /جستجو/ }).first()
if (await toggle.isVisible().catch(() => false)) {
  await toggle.click()
  const input = m.getByRole('combobox').first()
  await input.click()
  await input.fill('دریل')
  await m.waitForTimeout(700)
  const opts = await m.getByRole('option').count()
  const expanded = await input.getAttribute('aria-expanded')
  console.log(`  mobile suggestions: options=${opts} aria-expanded=${expanded}`)
  if (opts === 0) problems.push('[mobile search] no live suggestions for دریل')
  // Escape closes
  await input.press('Escape')
  await m.waitForTimeout(200)
  const afterEscape = await m.getByRole('option').count()
  console.log(`  after Escape: options=${afterEscape}`)
  if (afterEscape !== 0) problems.push('[mobile search] Escape did not close the suggestion list')
}
await mctx.close()
await browser.close()

console.log('\n=== MOBILE/RESPONSIVE AUDIT ===')
if (problems.length === 0) console.log('no problems found')
else problems.forEach(p => console.log(' - ' + p))
