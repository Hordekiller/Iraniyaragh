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

test('web: multi-variant products retain one complete server Product offer after hydration', async ({ page }) => {
  await prisma.productVariant.create({ data: { productId, sku: `SEO-BROWSER-${run}-MULTI`, skuKey: `SEO-BROWSER-${run}-MULTI`.toUpperCase(), combinationSignature: `seo-test-${run}`, title: 'تنوع دوم آزمایشی سئو', salePrice: 250000n, status: 'ACTIVE', isActive: true } });
  await page.goto(`${realWeb}/products/${slug}`, { waitUntil: 'networkidle' });
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
