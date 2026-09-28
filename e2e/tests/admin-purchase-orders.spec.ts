import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

async function navigate(page: Page, name: string, path: RegExp) {
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name }));
  await expect(page).toHaveURL(path);
}

test('staff creates references, a purchase-order draft and approves it without a stock receipt', async ({ page }) => {
  test.setTimeout(120_000);
  await signInDiAsAdmin(page);
  const suffix = Date.now().toString(36).toUpperCase();
  const supplierCode = `PO-SUP-${suffix}`;
  const warehouseCode = `PO-WH-${suffix}`;
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

  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(`کالای خرید ${suffix}`);
  await page.locator('#product-slug').fill(`po-e2e-${suffix.toLowerCase()}`);
  await page.locator('#variant-0-sku').fill(sku);
  await page.locator('#variant-0-cost').fill('120000');
  await page.locator('#variant-0-sale').fill('180000');
  await tap(page.locator('#product-status'));
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
});
