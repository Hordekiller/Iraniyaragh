import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

async function navigate(page: Page, name: string, path: RegExp) {
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name }));
  await expect(page).toHaveURL(path);
}

test('staff creates a purchase order and receives partial/final stock with persisted ledger evidence', async ({ page }) => {
  test.setTimeout(120_000);
  await signInDiAsAdmin(page);
  const suffix = Date.now().toString(36).toUpperCase();
  const supplierCode = `PO-SUP-${suffix}`;
  const warehouseCode = `PO-WH-${suffix}`;
  const locationCode = `PO-LOC-${suffix}`;
  const sku = `PO-SKU-${suffix}`;

  await navigate(page, 'تأمین‌کنندگان', /\/suppliers$/);
  await tap(page.getByRole('button', { name: 'تأمین‌کننده جدید' }));
  const supplier = page.getByRole('dialog', { name: 'تأمین‌کننده جدید' });
  await supplier.getByRole('textbox', { name: 'کد تأمین‌کننده' }).fill(supplierCode);
  await supplier.getByRole('textbox', { name: 'نام تأمین‌کننده' }).fill(`تأمین خرید ${suffix}`);
  await tap(supplier.getByRole('button', { name: 'ذخیره' }));
  await expect(page.getByRole('row', { name: new RegExp(supplierCode) })).toBeVisible();

  await navigate(page, 'انبارها', /\/warehouses$/);
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const warehouse = page.getByRole('dialog', { name: 'انبار جدید' });
  await warehouse.getByRole('textbox', { name: 'کد یکتا' }).fill(warehouseCode);
  await warehouse.getByRole('textbox', { name: 'نام انبار' }).fill(`انبار خرید ${suffix}`);
  await tap(warehouse.getByRole('button', { name: 'ذخیره' }));
  await expect(page.getByRole('row', { name: new RegExp(warehouseCode) })).toBeVisible();
  await tap(page.getByRole('row', { name: new RegExp(warehouseCode) }).getByRole('button', { name: 'مکان‌ها' }));
  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const location = page.getByRole('dialog', { name: 'مکان جدید' });
  await location.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(locationCode);
  await location.getByRole('textbox', { name: 'نام' }).fill('قفسه دریافت خرید');
  await tap(location.getByRole('button', { name: 'ذخیره' }));
  await expect(page.getByRole('row', { name: new RegExp(locationCode) })).toBeVisible();

  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(`کالای خرید ${suffix}`);
  await page.locator('#product-slug').fill(`po-e2e-${suffix.toLowerCase()}`);
  await page.locator('#variant-0-sku').fill(sku);
  await page.locator('#variant-0-cost').fill('120000');
  await page.locator('#variant-0-sale').fill('180000');
  await page.locator('#product-status').focus();
  await page.keyboard.press('Enter');
  await tap(page.getByRole('option', { name: 'منتشرشده' }));
  await tap(page.getByRole('button', { name: 'ثبت کالا' }));
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.locator('a[href^="/catalog/products/"]', { hasText: `کالای خرید ${suffix}` }).first()).toBeVisible();

  await navigate(page, 'سفارش‌های خرید', /\/purchase-orders$/);
  await tap(page.getByRole('button', { name: 'سفارش جدید' }));
  const form = page.getByRole('dialog', { name: 'سفارش خرید جدید' });
  await form.getByRole('combobox', { name: /تأمین‌کننده/ }).fill(supplierCode);
  await tap(page.getByRole('option', { name: new RegExp(supplierCode) }));
  await form.getByRole('combobox', { name: /انبار مقصد/ }).fill(warehouseCode);
  await tap(page.getByRole('option', { name: new RegExp(warehouseCode) }));
  await form.getByRole('combobox', { name: /SKU ردیف 1/ }).fill(sku);
  await tap(page.getByRole('option', { name: new RegExp(sku) }));
  await form.getByRole('spinbutton', { name: /تعداد/ }).fill('3');
  await form.getByRole('textbox', { name: /بهای واحد/ }).fill('120000');
  await expect(form.getByText(/۳۶۰٬۰۰۰ ریال/)).toBeVisible();
  await tap(form.getByRole('button', { name: 'ایجاد پیش‌نویس' }));
  await expect(form).toBeHidden();

  const detail = page.getByRole('dialog', { name: /سفارش خرید PO-/ });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('purchase-order.created')).toBeVisible();
  await expect(detail.getByRole('row', { name: new RegExp(sku) })).toContainText('۰');
  page.once('dialog', dialog => void dialog.accept());
  await tap(detail.getByRole('button', { name: 'تأیید سفارش' }));
  await expect(detail.getByText('تأییدشده')).toBeVisible();
  await expect(detail.getByRole('row', { name: new RegExp(sku) })).toContainText('۰');
  for (const [quantity, expectedStatus, expectedReceived] of [['1', 'دریافت ناقص', '۱'], ['2', 'دریافت‌شده', '۳']] as const) {
    await tap(detail.getByRole('button', { name: 'ثبت دریافت کالا' }));
    const receipt = page.getByRole('dialog', { name: /ثبت دریافت کالا برای PO-/ });
    await receipt.getByRole('textbox', { name: 'شمارهٔ حوالهٔ تأمین‌کننده' }).fill(`DEL-${quantity}-${suffix}`);
    await receipt.getByRole('combobox', { name: /مکان انبار ردیف 1/ }).fill(locationCode);
    await tap(page.getByRole('option', { name: new RegExp(locationCode) }));
    await receipt.getByRole('spinbutton', { name: 'تعداد واقعی' }).fill(quantity);
    await tap(receipt.getByRole('button', { name: 'ثبت رسید و افزایش موجودی' }));
    await expect(receipt).toBeHidden();
    await expect(detail.getByText(expectedStatus).first()).toBeVisible();
    await expect(detail.getByRole('row', { name: new RegExp(sku) })).toContainText(expectedReceived);
    await expect(detail.getByText(`DEL-${quantity}-${suffix}`)).toBeVisible();
  }
  await expect(detail.getByRole('button', { name: 'ثبت دریافت کالا' })).toHaveCount(0);
});
