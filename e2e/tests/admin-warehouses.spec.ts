import { expect, test } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

test('staff creates a real warehouse and location through the Admin inventory route', async ({ page }) => {
  await signInDiAsAdmin(page);
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name: 'انبارها' }));
  await expect(page).toHaveURL(/\/warehouses$/);

  const suffix = Date.now().toString(36);
  const warehouseCode = `E2E-WH-${suffix}`;
  const locationCode = `E2E-LOC-${suffix}`;
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const warehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
  await warehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(warehouseCode);
  await warehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill('انبار پذیرش');
  await tap(warehouseDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(warehouseDialog).toBeHidden();
  const warehouseRow = page.getByRole('row', { name: new RegExp(warehouseCode) });
  await expect(warehouseRow).toBeVisible();
  await tap(warehouseRow.getByRole('button', { name: 'مکان‌ها' }));
  await expect(page.getByText('مکان‌های انبار پذیرش')).toBeVisible();

  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const locationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
  await locationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(locationCode);
  await locationDialog.getByRole('textbox', { name: 'نام' }).fill('راهروی آزمون');
  await tap(locationDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(locationDialog).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(locationCode) })).toBeVisible();
});
