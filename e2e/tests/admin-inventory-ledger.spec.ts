import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';

const formatQuantity = new Intl.NumberFormat('fa-IR');

async function navigate(page: Page, name: string, pattern: RegExp) {
  const link = adminSidebar(page).getByRole('link', { name });
  if (!(await link.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(link);
  await expect(page).toHaveURL(pattern);
}

test('operator records receipt, reservations and a two-warehouse transfer through real inventory APIs', async ({ page }) => {
  test.setTimeout(180_000);
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
  const sourceWarehouseId = new URL(page.url()).searchParams.get('warehouseId');
  const sourceLocationId = new URL(page.url()).searchParams.get('locationId');
  expect(sourceWarehouseId).toBeTruthy();
  expect(sourceLocationId).toBeTruthy();

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

  await tap(balanceRow.getByRole('link', { name: 'رزروها' }));
  await expect(page).toHaveURL(/\/reservations\?warehouseId=/);
  const reservationsTable = page.getByRole('table', { name: 'رزروهای موجودی' });
  await tap(page.getByRole('button', { name: 'رزرو دستی' }));
  const createReservation = page.getByRole('dialog', { name: 'رزرو دستی موجودی' });
  await expect(createReservation.getByRole('textbox', { name: 'نسخهٔ مانده' })).toHaveValue('2');
  await createReservation.getByRole('textbox', { name: 'تعداد' }).fill('1');
  await createReservation.locator('input[type="datetime-local"]').fill('2099-01-01T12:00');
  await tap(createReservation.getByRole('button', { name: 'ثبت رزرو' }));
  await expect(createReservation).toBeHidden();
  const activeReservation = reservationsTable.getByRole('row').filter({ hasText: 'فعال' }).filter({ hasText: 'دستی' });
  await expect(activeReservation).toHaveCount(1);
  await tap(activeReservation.getByRole('button', { name: 'آزادسازی' }));
  const releaseDialog = page.getByRole('dialog', { name: 'آزادسازی رزرو دستی' });
  await expect(releaseDialog.getByText(/نسخهٔ مانده:/)).toBeVisible();
  await tap(releaseDialog.getByRole('button', { name: 'تأیید آزادسازی' }));
  await expect(releaseDialog).toBeHidden();
  await expect(reservationsTable.getByRole('row').filter({ hasText: 'آزادشده' })).toHaveCount(1);

  await tap(page.getByRole('button', { name: 'رزرو دستی' }));
  const secondCreate = page.getByRole('dialog', { name: 'رزرو دستی موجودی' });
  await secondCreate.getByRole('textbox', { name: 'نسخهٔ مانده' }).fill('4');
  await secondCreate.getByRole('textbox', { name: 'تعداد' }).fill('1');
  await secondCreate.locator('input[type="datetime-local"]').fill('2099-01-01T12:00');
  await tap(secondCreate.getByRole('button', { name: 'ثبت رزرو' }));
  await expect(secondCreate).toBeHidden();
  const activeAgain = reservationsTable.getByRole('row').filter({ hasText: 'فعال' }).filter({ hasText: 'دستی' });
  await expect(activeAgain).toHaveCount(1);
  await tap(activeAgain.getByRole('button', { name: 'مصرف' }));
  const consumeDialog = page.getByRole('dialog', { name: 'مصرف رزرو دستی' });
  await expect(consumeDialog.getByText(/نسخهٔ مانده:/)).toBeVisible();
  await tap(consumeDialog.getByRole('button', { name: 'تأیید مصرف' }));
  await expect(consumeDialog).toBeHidden();
  await expect(reservationsTable.getByRole('row').filter({ hasText: 'مصرف‌شده' })).toHaveCount(1);

  await navigate(page, 'انبارها', /\/warehouses$/);
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const targetWarehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
  await targetWarehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(`INV-DST-${suffix}`);
  await targetWarehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill('انبار مقصد آزمون');
  await tap(targetWarehouseDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(targetWarehouseDialog).toBeHidden();
  const targetWarehouseRow = page.getByRole('row', { name: new RegExp(`INV-DST-${suffix}`) });
  await expect(targetWarehouseRow).toBeVisible();
  await tap(targetWarehouseRow.getByRole('button', { name: 'مکان‌ها' }));
  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const targetLocationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
  await targetLocationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(`INV-DST-LOC-${suffix}`);
  await tap(targetLocationDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(targetLocationDialog).toBeHidden();
  const targetLocationRow = page.getByRole('row', { name: new RegExp(`INV-DST-LOC-${suffix}`) });
  const targetInventoryHref = await targetLocationRow.getByRole('link', { name: 'موجودی' }).getAttribute('href');
  const targetWarehouseId = new URL(targetInventoryHref ?? '', 'http://localhost').searchParams.get('warehouseId');
  const targetLocationId = new URL(targetInventoryHref ?? '', 'http://localhost').searchParams.get('locationId');
  expect(targetWarehouseId).toBeTruthy();
  expect(targetLocationId).toBeTruthy();

  await navigate(page, 'انتقال‌ها', /\/transfers$/);
  await tap(page.getByRole('link', { name: 'انتقال جدید' }));
  await expect(page).toHaveURL(/\/transfers\/new$/);
  await page.getByRole('textbox', { name: 'کد انتقال (اختیاری)' }).fill(`TRF-E2E-${suffix}`);
  await page.getByRole('textbox', { name: 'شناسه انبار مبدأ' }).fill(sourceWarehouseId ?? '');
  await page.getByRole('textbox', { name: 'شناسه انبار مقصد' }).fill(targetWarehouseId ?? '');
  await page.getByRole('textbox', { name: 'شناسه SKU ردیف 1' }).fill(variantId ?? '');
  await page.getByRole('textbox', { name: 'تعداد ردیف 1' }).fill('1');
  await page.getByRole('textbox', { name: 'شناسه مکان مبدأ ردیف 1' }).fill(sourceLocationId ?? '');
  await page.getByRole('textbox', { name: 'شناسه مکان مقصد ردیف 1' }).fill(targetLocationId ?? '');
  await tap(page.getByRole('button', { name: 'ساخت پیش‌نویس' }));
  await expect(page).toHaveURL(/\/transfers\/[^/]+$/);
  await expect(page.getByRole('heading', { name: `انتقال TRF-E2E-${suffix}` })).toBeVisible();

  for (const step of [
    { button: 'درخواست تأیید', dialog: 'درخواست تأیید انتقال', confirm: 'تأیید درخواست تأیید', status: 'در انتظار تأیید' },
    { button: 'تأیید', dialog: 'تأیید انتقال', confirm: 'تأیید تأیید', status: 'تأییدشده' },
    { button: 'ارسال', dialog: 'ارسال فیزیکی انتقال', confirm: 'تأیید ارسال فیزیکی', status: 'در راه' },
    { button: 'دریافت', dialog: 'دریافت فیزیکی انتقال', confirm: 'تأیید دریافت فیزیکی', status: 'تحویل‌شده' },
  ]) {
    await tap(page.getByRole('button', { name: step.button, exact: true }));
    const actionDialog = page.getByRole('dialog', { name: step.dialog });
    await expect(actionDialog.getByText(/نسخهٔ تأییدشده:/)).toBeVisible();
    await tap(actionDialog.getByRole('button', { name: step.confirm }));
    await expect(actionDialog).toBeHidden();
    await expect(page.getByText(`وضعیت: ${step.status}`)).toBeVisible();
  }

  await tap(page.getByRole('link', { name: 'مانده و گردش مبدأ' }));
  await expect(page).toHaveURL(/\/inventory\?warehouseId=/);
  const sourceBalance = page.getByRole('table', { name: 'ماندهٔ موجودی' }).getByRole('row', { name: new RegExp(variantId ?? '') });
  await expect(sourceBalance.getByRole('cell').nth(3)).toHaveText('۱');
  await expect(sourceBalance.getByRole('cell').nth(4)).toHaveText('۰');
  await expect(sourceBalance.getByRole('cell').nth(5)).toHaveText('۱');
  const sourceLedger = page.getByRole('table', { name: 'گردش دفترکل موجودی' });
  for (const movement of [
    { type: 'رسید', quantity: '۵', beforeAfter: '۰ ← ۵' },
    { type: 'تعدیل کاهشی', quantity: formatQuantity.format(-2), beforeAfter: '۵ ← ۳' },
    { type: 'فروش', quantity: formatQuantity.format(-1), beforeAfter: '۳ ← ۲' },
    { type: 'انتقال خروجی', quantity: formatQuantity.format(-1), beforeAfter: '۲ ← ۱' },
  ]) {
    const rows = sourceLedger.getByRole('row', { name: new RegExp(movement.type) });
    await expect(rows).toHaveCount(1);
    await expect(rows.getByRole('cell').nth(5)).toHaveText(movement.quantity);
    await expect(rows.getByRole('cell').nth(6)).toHaveText(movement.beforeAfter);
  }
  await expect(sourceLedger.getByRole('row')).toHaveCount(5);

  await page.goBack();
  await expect(page.getByText('وضعیت: تحویل‌شده')).toBeVisible();
  await tap(page.getByRole('link', { name: 'مانده و گردش مقصد' }));
  await expect(page).toHaveURL(/\/inventory\?warehouseId=/);
  const targetBalance = page.getByRole('table', { name: 'ماندهٔ موجودی' }).getByRole('row', { name: new RegExp(variantId ?? '') });
  await expect(targetBalance.getByRole('cell').nth(3)).toHaveText('۱');
  await expect(targetBalance.getByRole('cell').nth(4)).toHaveText('۰');
  await expect(targetBalance.getByRole('cell').nth(5)).toHaveText('۱');
  const targetLedger = page.getByRole('table', { name: 'گردش دفترکل موجودی' });
  const inboundRows = targetLedger.getByRole('row', { name: /انتقال ورودی/ });
  await expect(inboundRows).toHaveCount(1);
  await expect(inboundRows.getByRole('cell').nth(5)).toHaveText('۱');
  await expect(inboundRows.getByRole('cell').nth(6)).toHaveText('۰ ← ۱');
  await expect(targetLedger.getByRole('row')).toHaveCount(2);
});
