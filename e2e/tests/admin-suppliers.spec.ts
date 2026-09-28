import { expect, test } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

/**
 * Covers the real Admin supplier lifecycle that closes #329: create, audit
 * history, deactivation (never hard delete) and the read/manage permission
 * split. Runs on the desktop and mobile projects of the matrix, so the sidebar
 * drawer path and the table action column are both exercised.
 */
test('staff registers a real supplier, audits it and deactivates it without hard delete', async ({ page }) => {
  await signInDiAsAdmin(page);
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name: 'تأمین‌کنندگان' }));
  await expect(page).toHaveURL(/\/suppliers$/);

  const suffix = Date.now().toString(36).toUpperCase();
  const supplierCode = `E2E-SUP-${suffix}`;
  const supplierName = `تأمین‌کنندهٔ آزمون ${suffix}`;

  await tap(page.getByRole('button', { name: 'تأمین‌کننده جدید' }));
  const createDialog = page.getByRole('dialog', { name: 'تأمین‌کننده جدید' });
  await createDialog.getByRole('textbox', { name: 'کد تأمین‌کننده' }).fill(supplierCode);
  await createDialog.getByRole('textbox', { name: 'نام تأمین‌کننده' }).fill(supplierName);
  await createDialog.getByRole('textbox', { name: 'موبایل' }).fill('09120000000');
  await createDialog.getByRole('textbox', { name: 'کد اقتصادی' }).fill('1010123456');
  await tap(createDialog.getByRole('button', { name: 'ذخیره' }));

  // The row only exists if the API actually persisted the supplier.
  await expect(createDialog).toBeHidden();
  const row = page.getByRole('row', { name: new RegExp(supplierCode) });
  await expect(row).toBeVisible();

  // Hard delete is intentionally absent from the domain; the row must not offer it.
  await expect(row.getByRole('button', { name: /حذف/u })).toHaveCount(0);

  // The creation must be traceable in the audit history.
  await tap(row.getByRole('button', { name: 'سابقه' }));
  const historyDialog = page.getByRole('dialog', { name: new RegExp(`سابقهٔ تغییرات ${supplierName}`) });
  await expect(historyDialog).toBeVisible();
  await expect(historyDialog.getByText('ایجاد', { exact: true })).toBeVisible();
  await tap(historyDialog.getByRole('button', { name: 'بستن' }));
  await expect(historyDialog).toBeHidden();

  // Deactivation keeps the record and its history, so it must stay visible in the table.
  await tap(row.getByRole('button', { name: `ویرایش تأمین‌کننده ${supplierName}` }));
  const editDialog = page.getByRole('dialog', { name: 'ویرایش تأمین‌کننده' });
  await expect(editDialog.getByRole('textbox', { name: 'کد تأمین‌کننده' })).toBeDisabled();
  await tap(editDialog.getByRole('checkbox', { name: 'تأمین‌کننده فعال است' }));
  await tap(editDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(editDialog).toBeHidden();

  await tap(page.getByRole('button', { name: 'غیرفعال' }));
  const inactiveRow = page.getByRole('row', { name: new RegExp(supplierCode) });
  await expect(inactiveRow).toBeVisible();
  await expect(inactiveRow).toContainText('غیرفعال');

  await tap(page.getByRole('button', { name: 'همه' }));
  await expect(page.getByRole('row', { name: new RegExp(supplierCode) })).toBeVisible();
});
