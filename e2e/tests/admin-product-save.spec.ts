import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { signInDiAsAdmin } from './helpers';

async function sourceEditor(page: Page) {
  await expect(page.locator('[data-rich-text-editor]')).toHaveAttribute('data-status', 'ready');
  const source = page.locator('textarea.jodit-source__mirror');
  if (!await source.isVisible()) await page.locator('[data-ref="source"] button').click();
  await expect(source).toBeVisible(); return source;
}
const descriptionResponse = (page: Page) => page.waitForResponse(response => response.request().method() === 'PATCH' && new URL(response.url()).pathname.endsWith('/description'));

test('long Persian product content survives create, edit, lost response and browser reload', async ({ page }) => {
  await signInDiAsAdmin(page);
  await page.goto('/catalog/products/new');
  await page.getByLabel('نام کالا', { exact: false }).fill('کالای آزمایشی ذخیرهٔ متن بلند');
  const slug = `save-test-${randomUUID()}`;
  await page.getByLabel('شناسهٔ یکتا (Slug)', { exact: false }).fill(slug);
  await page.locator('#variant-0-sku').fill(`SAVE-TEST-${randomUUID()}`);
  await page.locator('#variant-0-sale').fill('10000');
  const original = `<h2>راهنمای خرید و نصب</h2><p>${'توضیحات دقیق فارسی محصول '.repeat(3000)}</p><h3>مشخصات فنی</h3><table><tbody><tr><th scope="col">جنس</th><td>فولاد</td></tr></tbody></table><p><a href="https://example.test/guide">راهنمای نصب</a></p>`;
  expect(original.length).toBeLessThan(100000); expect(Buffer.byteLength(original)).toBeGreaterThan(100 * 1024);
  await (await sourceEditor(page)).fill(original);
  const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/catalog/admin/products'));
  await page.getByRole('button', { name: 'ثبت کالا', exact: true }).click();
  const created = await createdResponse; expect(created.status()).toBe(201);
  expect(created.request().postDataJSON().description).toBe(original);
  const product = (await created.json()).data.product;
  await expect(page).toHaveURL(new RegExp(`/catalog/products/${product.id}$`));
  await expect(await sourceEditor(page)).toHaveValue(original);

  const edited = `${original}<p>آخرین ویرایش پیش از ثبت</p>`;
  await (await sourceEditor(page)).fill(edited);
  const savedResponse = descriptionResponse(page);
  await page.getByTestId('description-save').click();
  const saved = await savedResponse; expect(saved.status()).toBe(200); expect(saved.request().postDataJSON().description).toBe(edited);
  await expect(page.getByTestId('description-saved')).toBeVisible();
  await page.reload();
  await expect(await sourceEditor(page)).toHaveValue(edited);
  await expect(page.getByTestId('description-recovery')).toHaveCount(0);

  // Commit through the real API, then drop only its response. Recovery must use
  // the original durable idempotency command, even after reloading the browser.
  const uncertain = `${edited}<p>ثبت با پاسخ قطع‌شده</p>`;
  let firstKey = '';
  await page.route('**/catalog/admin/products/*/description', async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    firstKey = route.request().headers()['idempotency-key'];
    const response = await route.fetch(); expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await (await sourceEditor(page)).fill(uncertain);
  await page.getByTestId('description-save').click();
  await expect(page.getByTestId('description-error')).toBeVisible();
  await expect(page.getByTestId('description-saved')).toHaveCount(0);
  await page.unroute('**/catalog/admin/products/*/description');
  page.once('dialog', dialog => dialog.accept());
  await page.reload();
  await expect(page.getByTestId('description-recovery')).toBeVisible();
  await page.getByRole('button', { name: 'بازیابی نوشتهٔ من' }).click();
  const replayResponse = descriptionResponse(page);
  await page.getByTestId('description-retry').click();
  const replay = await replayResponse; expect(replay.status()).toBe(200);
  expect(replay.request().headers()['idempotency-key']).toBe(firstKey);
  expect(replay.request().postDataJSON()).toEqual({ description: uncertain, expectedVersion: product.version + 1 });
  expect((await replay.json()).data.product.version).toBe(product.version + 2);
  await expect(page.getByTestId('description-saved')).toBeVisible();
  await page.reload();
  await expect(await sourceEditor(page)).toHaveValue(uncertain);
  await expect(page.getByTestId('description-recovery')).toHaveCount(0);
});
