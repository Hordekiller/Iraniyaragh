import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';

async function navigate(page: Page, name: string, pattern: RegExp) {
  const link = adminSidebar(page).getByRole('link', { name });
  if (!(await link.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(link);
  await expect(page).toHaveURL(pattern);
}

test('operator records a real receipt and an audited adjustment through the inventory ledger', async ({ page }) => {
  test.setTimeout(90_000);
  await signInDiAsAdmin(page);
  const suffix = Date.now().toString(36);

  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(`کالای انبار ${suffix}`);
  await page.locator('#product-slug').fill(`inventory-e2e-${suffix}`);
  await page.locator('#variant-0-sku').fill(`INV-E2E-${suffix}`);
  await page.locator('#variant-0-cost').fill('100000');
  await page.locator('#variant-0-sale').fill('150000');
  await tap(page.getByRole('button', { name: 'ثبت کالا' }));
  await expect(page).toHaveURL(/\/catalog$/);
  const productLink = page.locator('a[href^="/catalog/products/"]', { hasText: `کالای انبار ${suffix}` }).first();
  await expect(productLink).toBeVisible();
  await tap(productLink);
  const skuInventoryLink = page.locator('a[href^="/inventory?variantId="]').first();
  await expect(skuInventoryLink).toBeVisible();
  const skuHref = await skuInventoryLink.getAttribute('href');
  const variantId = new URL(skuHref ?? '', 'http://localhost').searchParams.get('variantId');
  expect(variantId).toBeTruthy();

  await navigate(page, 'انبارها', /\/warehouses$/);
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const warehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
  await warehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(`INV-WH-${suffix}`);
  await warehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill('انبار آزمون دفترکل');
  await tap(warehouseDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(warehouseDialog).toBeHidden();
  const warehouseRow = page.getByRole('row', { name: new RegExp(`INV-WH-${suffix}`) });
  await expect(warehouseRow).toBeVisible();
  await tap(warehouseRow.getByRole('button', { name: 'مکان‌ها' }));
  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const locationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
  await locationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(`INV-LOC-${suffix}`);
  await tap(locationDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(locationDialog).toBeHidden();
  const locationRow = page.getByRole('row', { name: new RegExp(`INV-LOC-${suffix}`) });
  await expect(locationRow).toBeVisible();
  await tap(locationRow.getByRole('link', { name: 'موجودی' }));
  await expect(page).toHaveURL(/\/inventory\?warehouseId=/);

  await tap(page.getByRole('button', { name: 'رسید یا تعدیل' }));
  const stockDialog = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
  await stockDialog.getByRole('textbox', { name: 'شناسه SKU' }).fill(variantId ?? '');
  await stockDialog.getByRole('textbox', { name: 'تعداد' }).fill('5');
  await tap(stockDialog.getByRole('button', { name: 'ثبت تغییر' }));
  await expect(stockDialog).toBeHidden();
  const balanceTable = page.getByRole('table', { name: 'ماندهٔ موجودی' });
  const balanceRow = balanceTable.getByRole('row', { name: new RegExp(variantId ?? '') });
  await expect(balanceRow).toBeVisible();
  await expect(balanceRow).toContainText('۵');

  await tap(balanceRow.getByRole('button', { name: 'رسید/تعدیل' }));
  const adjustmentDialog = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
  await expect(adjustmentDialog.getByRole('textbox', { name: 'نسخهٔ مانده' })).toHaveValue('1');
  await adjustmentDialog.getByRole('combobox', { name: 'نوع تغییر' }).dispatchEvent('mousedown');
  await tap(page.getByRole('option', { name: 'تعدیل کاهشی (−)' }));
  await adjustmentDialog.getByRole('textbox', { name: 'تعداد' }).fill('2');
  await adjustmentDialog.getByRole('textbox', { name: 'دلیل' }).fill('اصلاح شمارش آزمون');
  await tap(adjustmentDialog.getByRole('button', { name: 'ثبت تغییر' }));
  await expect(adjustmentDialog).toBeHidden();
  await expect(balanceRow).toContainText('۳');
  await expect(page.getByRole('table', { name: 'گردش دفترکل موجودی' }).getByRole('row', { name: /تعدیل کاهشی/ })).toContainText('اصلاح شمارش آزمون');
});
