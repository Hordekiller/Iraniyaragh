import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
type Model = { create(input: unknown): Promise<{ id: string }>; delete(input: unknown): Promise<unknown>; deleteMany(input: unknown): Promise<unknown>; update(input: unknown): Promise<unknown> };
type SeoTestDatabase = { product: Model; category: Model; productVariant: Model; $disconnect(): Promise<void> };

const realWeb = process.env.WEB_E2E_REAL_URL ?? 'http://127.0.0.1:4174';
const canonical = process.env.PUBLIC_WEB_ORIGIN ?? 'https://iraniyaragh.example';
const run = randomUUID().replaceAll('-', '').slice(0, 12);
let prisma: SeoTestDatabase;
let productId = '', categoryId = '', draftId = '';
const slug = `seo-browser-${run}`, categorySlug = `seo-category-${run}`;
const title = `لولای آزمایشی سئو ${run}`;

test.beforeAll(async () => {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) throw new Error('SEO browser acceptance requires an isolated loopback *_test database.');
  const require = createRequire(resolve(__dirname, '../../apps/api/package.json'));
  const { PrismaClient } = require('@prisma/client') as { PrismaClient: new () => SeoTestDatabase };
  prisma = new PrismaClient();
  categoryId = (await prisma.category.create({ data: { name: `دسته آزمایشی سئو ${run}`, slug: categorySlug } })).id;
  const create = (status: 'ACTIVE' | 'DRAFT', suffix: string) => prisma.product.create({ data: { name: title+suffix, slug: slug+suffix, categoryId, status, description: '<h2>راهنمای نصب آزمایشی</h2><p>متن فارسی واقعی در HTML اولیه</p>', variants: { create: { sku: `SEO-BROWSER-${run}${suffix}`, skuKey: `SEO-BROWSER-${run}${suffix}`.toUpperCase(), combinationSignature: 'empty', salePrice: 150000n, status: 'ACTIVE', isActive: true } } } });
  productId = (await create('ACTIVE', '')).id;
  draftId = (await create('DRAFT', '-draft')).id;
});
test.afterAll(async () => {
  if (!prisma) return;
  const ids = [productId, draftId].filter(Boolean);
  await prisma.productVariant.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

test('web: public product and category primary content work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    const response = await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'راهنمای نصب آزمایشی' })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${canonical}/products/${slug}`);
    const schema = await page.locator('script[type="application/ld+json"]').allTextContents();
    const product = schema.flatMap(text => JSON.parse(text)).find(value => value['@type'] === 'Product');
    expect(product).toMatchObject({ name: title, offers: { price: '150000', priceCurrency: 'IRR' } });
    expect(product).not.toHaveProperty('aggregateRating');
    expect((await page.goto(`${realWeb}/categories/${categorySlug}`, { waitUntil: 'domcontentloaded' }))?.status()).toBe(200);
    await expect(page.getByRole('link', { name: new RegExp(title) }).first()).toHaveAttribute('href', `/products/${slug}`);
    await prisma.product.update({ where: { id: productId }, data: { description: '<h2>متن به‌روز شدهٔ آزمایشی</h2>' } });
    await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'متن به‌روز شدهٔ آزمایشی' })).toBeVisible();
  } finally { await context.close(); }
});

test('web: saved description keeps inline and responsive styling inside its content boundary', async ({ page }) => {
  await prisma.product.update({ where: { id: productId }, data: { description: '<style>#test-layout{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:820px){#test-layout{grid-template-columns:1fr}}body{display:none}</style><section id="test-layout"><p style="font-size:18px;line-height:2;color:#123456">متن قالب آزمایشی</p><p>بخش دوم آزمایشی</p></section>' } });
  await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'domcontentloaded' });
  const text = page.getByText('متن قالب آزمایشی', { exact: true });
  await expect(text).toBeVisible();
  await expect(text).toHaveCSS('font-size', '18px');
  await expect(text).toHaveCSS('line-height', '36px');
  await expect(text).toHaveCSS('color', 'rgb(18, 52, 86)');
  await expect(page.getByRole('link', { name: 'ایرانی یراق؛ صفحهٔ اصلی', exact: true })).toBeVisible();
  const layout = page.locator('#iyc-test-layout');
  await expect(layout).toHaveCSS('display', 'grid');
  const columns = await layout.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(page.viewportSize()!.width <= 820 ? 1 : 2);
  const data = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(value => JSON.parse(value));
  expect(data.find(value => value['@type'] === 'Product').description).not.toMatch(/display:grid|@media/u);
});

test('web: multi-variant products retain one complete server Product offer after hydration', async ({ page }) => {
  await prisma.productVariant.create({ data: { productId, sku: `SEO-BROWSER-${run}-MULTI`, skuKey: `SEO-BROWSER-${run}-MULTI`.toUpperCase(), combinationSignature: `seo-test-${run}`, title: 'تنوع دوم آزمایشی سئو', salePrice: 250000n, status: 'ACTIVE', isActive: true } });
  const hydrated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/guest-cart' && response.request().method() === 'GET' && response.ok());
  await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'domcontentloaded' });
  await hydrated;
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'تنوع دوم آزمایشی سئو' })).toBeVisible();
  const schemas = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(text => JSON.parse(text));
  const products = schemas.filter(value => value['@type'] === 'Product');
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({ sku: `SEO-BROWSER-${run}`, offers: { '@type': 'Offer', price: '150000', priceCurrency: 'IRR', url: `${canonical}/products/${slug}` } });
  expect(products[0]).not.toHaveProperty('aggregateRating');
});

test('web: legacy URLs redirect once and unknown or unpublished products return actual 404', async ({ request }) => {
  for (const path of [`/product/${slug}`, `/product/${productId}`, `/products/${productId}`]) {
    const response = await request.get(`${realWeb}${path}`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(new URL(response.headers().location, realWeb).pathname).toBe(`/products/${slug}`);
  }
  for (const path of [`/products/${slug}-draft`, `/products/no-product-${run}`, `/categories/${categorySlug}?page=999999`, '/not-a-public-route', '/cart/anything', '/checkout/anything', '/account/unknown', '/account/invoices/test/extra', '/payment/test/unknown']) {
    const response = await request.get(`${realWeb}${path}`);
    expect(response.status()).toBe(404);
  }
  const response = await request.get(`${realWeb}/products/${slug}`, { headers: { 'X-Forwarded-Host': 'attacker.example', Host: 'attacker.example' } });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain(`href="${canonical}/products/${slug}"`);
});

test('web: product mobile dock defaults to purchase and switches one surface without overlap', async ({ page }) => {
  const hydrated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/guest-cart' && response.request().method() === 'GET' && response.ok());
  await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'domcontentloaded' });
  await hydrated;
  const price = page.getByRole('region', { name: 'قیمت و خرید محصول', exact: true });
  const menu = page.getByRole('navigation', { name: 'ناوبری پایین', exact: true });
  const choices = page.getByRole('group', { name: 'نمایش نوار پایین محصول' });
  await expect(price).toBeVisible();
  await expect(menu).not.toBeVisible();
  await expect(page.locator('#product-purchase')).toHaveCount(1);
  if (page.viewportSize()!.width >= 1024) {
    await expect(choices).not.toBeVisible();
    return;
  }
  const purchaseNode = await page.locator('#product-price-panel').elementHandle();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const priceChoice = page.getByRole('button', { name: 'قیمت و خرید', exact: true });
    const menuChoice = page.getByRole('button', { name: 'منوی سایت', exact: true });
    await expect(priceChoice).toHaveAttribute('aria-pressed', 'true');
    await menuChoice.focus();
    await page.keyboard.press('Enter');
    await expect(menuChoice).toHaveAttribute('aria-pressed', 'true');
    await expect(menu).toBeVisible();
    await expect(price).not.toBeVisible();
    expect(await menuChoice.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await expect(page.locator('nav[aria-label="ناوبری پایین"]:visible')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await priceChoice.click();
    await expect(price).toBeVisible();
    await expect(menu).not.toBeVisible();
    expect(await purchaseNode!.evaluate(node => node === document.getElementById('product-price-panel'))).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'منوی سایت', exact: true }).click();
  await expect(menu).toBeVisible();
  await expect(page.locator('#product-menu-panel')).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(price).toBeVisible();
  await expect(menu).not.toBeVisible();
  await expect(choices).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'قیمت و خرید', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(price).toBeVisible();
  await expect(menu).not.toBeVisible();
});
