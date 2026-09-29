import { expect, test } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

/**
 * Covers the real Admin customer lifecycle that closes #349: create with a
 * normalized mobile, staff-only note, address set, and deactivation instead of
 * a hard delete. Runs on the desktop and mobile projects, so the sidebar
 * drawer path and the table action column are both exercised.
 */
test('staff registers a real customer, annotates it and deactivates it without hard delete', async ({ page }) => {
  // The full journey (create, address, note, reopen, deactivate, re-verify) is
  // longer than the 30s default, in the same way the purchase-orders journey is.
  test.setTimeout(120_000);
  await signInDiAsAdmin(page);
  if (isMobile(page)) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(adminSidebar(page).getByRole('link', { name: 'مشتریان' }));
  await expect(page).toHaveURL(/\/customers$/);

  // A unique mobile per run: the mobile is the record's unique key, so reusing
  // one would legitimately fail with a duplicate conflict.
  const suffix = Date.now().toString().slice(-9);
  const mobile = `09${suffix}`;
  const canonicalMobile = `+989${suffix}`;

  await tap(page.getByRole('button', { name: 'مشتری جدید' }));
  const createDialog = page.getByRole('dialog', { name: 'مشتری جدید' });
  await createDialog.getByRole('textbox', { name: 'موبایل' }).fill(mobile);
  await createDialog.getByRole('textbox', { name: 'نام', exact: true }).fill('زهرا');
  await createDialog.getByRole('textbox', { name: 'نام خانوادگی' }).fill('آزمون');
  await tap(createDialog.getByRole('button', { name: 'ذخیره' }));

  await expect(createDialog).toBeHidden();
  const row = page.getByRole('row', { name: new RegExp(suffix) });
  await expect(row).toBeVisible();

  // The staff directory canonicalises the mobile to E.164, so a 09… input must
  // come back as +989… rather than being stored verbatim.
  await expect(row).toContainText(canonicalMobile);
  await expect(row).toContainText('زهرا آزمون');

  // Hard delete is intentionally absent from the domain.
  await expect(row.getByRole('button', { name: /حذف/u })).toHaveCount(0);

  // Only one dialog is mounted at a time: opening the address panel takes over
  // from the detail view, so the detail dialog is expected to close.
  const detailDialog = page.getByRole('dialog').filter({ hasText: 'جزئیات مشتری' }).first();
  const addressesDialog = page.getByRole('dialog').filter({ hasText: 'نشانی‌ها و وضعیت مشتری' });

  await tap(row.getByRole('button', { name: 'جزئیات' }));
  await expect(detailDialog).toBeVisible();
  await tap(detailDialog.getByRole('button', { name: 'نشانی‌ها و وضعیت' }));
  await expect(addressesDialog).toBeVisible();
  await expect(detailDialog).toBeHidden();

  await addressesDialog.getByRole('textbox', { name: 'برچسب' }).fill('خانه');
  await addressesDialog.getByRole('textbox', { name: 'نام گیرنده' }).fill('زهرا آزمون');
  await addressesDialog.getByRole('textbox', { name: 'موبایل گیرنده' }).fill(mobile);
  await addressesDialog.getByRole('textbox', { name: 'کد استان' }).fill('THR');
  await addressesDialog.getByRole('textbox', { name: 'شهر' }).fill('تهران');
  await addressesDialog.getByRole('textbox', { name: 'نشانی' }).fill('خیابان آزمون، پلاک ۱');
  await addressesDialog.getByRole('checkbox', { name: 'نشانی پیش‌فرض' }).check();

  await tap(addressesDialog.getByRole('button', { name: 'ذخیرهٔ نشانی‌ها' }));
  await expect(addressesDialog).toBeHidden();

  // A note is staff-only, and appending one must not disturb the addresses.
  await tap(row.getByRole('button', { name: 'جزئیات' }));
  await expect(detailDialog).toBeVisible();
  await tap(detailDialog.getByRole('button', { name: 'افزودن یادداشت' }));
  const noteDialog = page.getByRole('dialog').filter({ hasText: 'افزودن یادداشت به مشتری' });
  await expect(noteDialog).toBeVisible();
  await noteDialog.getByRole('textbox', { name: 'متن یادداشت' }).fill('یادداشت داخلی آزمون');
  await tap(noteDialog.getByRole('button', { name: 'ثبت یادداشت' }));
  await expect(noteDialog).toBeHidden();

  // The reopened detail must show the internal note and the single default.
  await tap(row.getByRole('button', { name: 'جزئیات' }));
  await expect(detailDialog).toBeVisible();
  await expect(detailDialog.getByText('یادداشت داخلی آزمون')).toBeVisible();
  await expect(detailDialog.getByText('داخلی', { exact: true })).toBeVisible();
  await expect(detailDialog.getByText('خانه', { exact: true })).toBeVisible();
  await expect(detailDialog.getByText('پیش‌فرض', { exact: true })).toBeVisible();
  await tap(detailDialog.getByRole('button', { name: 'بستن' }));
  await expect(detailDialog).toBeHidden();

  // Deactivation keeps the record and its history, so it must remain listed.
  await tap(row.getByRole('button', { name: 'جزئیات' }));
  await expect(detailDialog).toBeVisible();
  await tap(detailDialog.getByRole('button', { name: 'نشانی‌ها و وضعیت' }));
  await expect(addressesDialog).toBeVisible();
  // The status select is opened with a mousedown, as in the inventory ledger
  // journey, and committed with a real click so the popup closes.
  await addressesDialog.getByRole('combobox', { name: 'وضعیت مشتری' }).dispatchEvent('mousedown');
  await page.getByRole('option', { name: 'غیرفعال' }).click();
  await expect(addressesDialog.getByRole('combobox', { name: 'وضعیت مشتری' })).toHaveText('غیرفعال');
  await tap(addressesDialog.getByRole('button', { name: 'ذخیرهٔ نشانی‌ها' }));
  await expect(addressesDialog).toBeHidden();

  await page.getByRole('combobox', { name: 'فیلتر وضعیت مشتری' }).dispatchEvent('mousedown');
  await page.getByRole('option', { name: 'غیرفعال' }).click();

  const inactiveRow = page.getByRole('row', { name: new RegExp(suffix) });
  await expect(inactiveRow).toBeVisible();
  await expect(inactiveRow).toContainText('غیرفعال');

  // The deactivated record must still resolve with its note and address intact.
  await tap(inactiveRow.getByRole('button', { name: 'جزئیات' }));
  await expect(detailDialog.getByText('غیرفعال‌شده در')).toBeVisible();
  await expect(detailDialog.getByText('یادداشت داخلی آزمون')).toBeVisible();
  await expect(detailDialog.getByText('خانه', { exact: true })).toBeVisible();
});
