import { expect, test, type Page } from '@playwright/test';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';

async function navigate(page: Page, name: string, url: RegExp) {
  const link = adminSidebar(page).getByRole('link', { name, exact: true });
  if (!(await link.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(link); await expect(page).toHaveURL(url);
}

test('operator counts persisted physical stock and approves an immutable reconciled ledger movement', async ({ page }) => {
  await signInDiAsAdmin(page);
  const suffix = `${test.info().project.name}-${Date.now().toString(36)}`;
  const sku = `ST-E2E-${suffix}`;
  const warehouseCode = `ST-WH-${suffix}`;
  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(`کالای شمارش ${suffix}`);
  await page.locator('#product-slug').fill(`stocktake-e2e-${suffix}`);
  await page.locator('#variant-0-sku').fill(sku);
  await page.locator('#variant-0-cost').fill('100000');
  await page.locator('#variant-0-sale').fill('150000');
  await tap(page.getByRole('button', { name: 'ثبت کالا' }));
  await expect(page).toHaveURL(/\/catalog\/products\/(?!new(?:\/|$))[^/]+$/);
  const inventoryLink = page.locator('a[href^="/inventory?variantId="]').first();
  await expect(inventoryLink).toBeVisible();
  const variantId = new URL((await inventoryLink.getAttribute('href'))!, 'http://localhost').searchParams.get('variantId')!;

  await navigate(page, 'انبارها', /\/warehouses$/);
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const warehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
  await warehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(warehouseCode);
  await warehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill(`انبار شمارش ${suffix}`);
  await tap(warehouseDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(warehouseDialog).toBeHidden();
  const warehouseRow = page.getByRole('row').filter({ hasText: warehouseCode });
  await tap(warehouseRow.getByRole('button', { name: 'مکان‌ها' }));
  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const locationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
  await locationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(`ST-LOC-${suffix}`);
  await tap(locationDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(locationDialog).toBeHidden();
  await tap(page.getByRole('row').filter({ hasText: `ST-LOC-${suffix}` }).getByRole('link', { name: 'موجودی' }));
  await tap(page.getByRole('button', { name: 'رسید یا تعدیل' }));
  const receipt = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
  await receipt.getByRole('textbox', { name: 'شناسه SKU' }).fill(variantId);
  await receipt.getByRole('textbox', { name: 'تعداد' }).fill('5');
  await tap(receipt.getByRole('button', { name: 'ثبت تغییر' }));
  await expect(receipt).toBeHidden();
  const inventoryUrl = page.url();

  await navigate(page, 'انبارگردانی', /\/stocktakes$/);
  await tap(page.getByRole('button', { name: 'برگهٔ جدید' }));
  const create = page.getByRole('dialog', { name: 'برگهٔ جدید انبارگردانی' });
  await create.getByRole('combobox', { name: 'انبار', exact: true }).fill(warehouseCode);
  await tap(page.getByRole('option').filter({ hasText: warehouseCode }));
  await tap(create.getByRole('button', { name: 'ثبت برگه' }));
  await expect(page).toHaveURL(/\/stocktakes\/[^/]+$/);
  await tap(page.getByRole('button', { name: 'آغاز شمارش' }));
  const countInput = page.getByRole('textbox', { name: `مقدار شمارش ${sku}` });
  await expect(countInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeDisabled();
  await countInput.fill('۴');
  await tap(page.getByRole('button', { name: /ثبت .*خط/ }));
  await expect(page.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole('table', { name: 'برگهٔ شمارش' })).toContainText('۴');
  await tap(page.getByRole('button', { name: 'ارسال برای بازبینی' }));
  await expect(countInput).toHaveCount(0);
  await tap(page.getByRole('button', { name: 'تأیید و اعمال روی دفترکل' }));
  await expect(page.getByText('موجودی این برگه روی دفترکل اعمال شده و برگه تغییرناپذیر است.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'لغو برگه' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'تاریخچهٔ انبارگردانی' })).toContainText('تأیید و ثبت دفترکل');
  await page.goto(inventoryUrl);
  const ledger = page.getByRole('table', { name: 'گردش دفترکل موجودی' });
  await expect(ledger.getByRole('row').filter({ hasText: 'انبارگردانی' })).toContainText('Physical count approved for');
  await expect(page.getByRole('table', { name: 'ماندهٔ موجودی' }).getByRole('row').filter({ hasText: variantId })).toContainText('۴');
});
