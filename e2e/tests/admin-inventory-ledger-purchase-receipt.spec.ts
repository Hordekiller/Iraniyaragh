import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { adminSidebar, isMobile, signInDiAsAdmin, tap } from './helpers';

/**
 * Ledger reconciliation for the merged purchasing path (#340/#342/#344/#346).
 *
 * `docs/ADMIN_INVENTORY_TRANSFERS.md` records the accepted criterion for the
 * inventory ledger: ending balances must reconcile against the exact movement
 * chain, "with one row per expected physical effect". #331 proved that for the
 * pre-purchasing chain (receipt, adjustment, consumed reservation, transfer in
 * and out). This spec proves the same criterion once the goods-receipt path is
 * part of the journey: purchase receipts must appear in the same ledger exactly
 * once per received line, chained to the previous physical effect and
 * attributable to a PurchaseReceiptLine with a visible external reference and
 * actor.
 *
 * Everything is driven through the real Admin screens against the real API: no
 * network mocking, no fixtures, no bypassed UI. Every warehouse, location,
 * supplier, product, purchase order, receipt, reservation and transfer in this
 * spec is created by the test through the operator UI.
 *
 * Clicking "انتشار" requires one ready primary product image, so the test
 * uploads a real asset through the media manager and waits for the worker to
 * reach READY before publishing - the only path that puts a variant inside the
 * purchase-order options. This mirrors the CI e2e job, which runs MinIO and the
 * media worker.
 */

const SAMPLE_IMAGE = resolve(__dirname, '../../apps/web/public/images/hero1.jpg');
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parses a number rendered by `Intl.NumberFormat('fa-IR')` (Persian digits,
 * `٬` group separator, `−` U+2212 sign). The admin renders ledger cells and
 * receipt line quantities with that formatter, so raw values cannot be parsed
 * with `Number()`.
 */
function parseLedgerNumber(value: string): number {
  const latin = value
    .replace(/[۰-۹]/gu, digit => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/gu, digit => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[−–—]/gu, '-')
    .replace(/[^0-9-]/gu, '');
  return Number.parseInt(latin, 10);
}

type LedgerRow = { type: string; quantity: number; before: number; after: number; reason: string };
type LedgerBalance = { onHand: number; reserved: number; available: number; version: number };
type LedgerFilters = { warehouseId: string; locationId: string; variantId: string };

async function navigate(page: Page, name: string, pattern: RegExp) {
  const link = adminSidebar(page).getByRole('link', { name });
  if (isMobile(page)) {
    await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  }
  await expect(link).toBeVisible();
  await tap(link);
  await expect(page).toHaveURL(pattern);
}

/**
 * Asks a server-paginated admin table for its largest page size.
 *
 * Warehouses/suppliers default to 25 rows per page, so a row this spec just
 * created falls onto the next page in a database that already holds earlier
 * runs' entities. Widening the page keeps the row lookup deterministic without
 * depending on how much data the test database has collected.
 */
async function useLargestPageSize(page: Page) {
  // A screen can hold more than one table (warehouses lists locations below it),
  // and each has its own rows-per-page select, so the first one is the list this
  // spec is about.
  const pageSize = page.getByRole('combobox', { name: /ردیف در صفحه/ }).first();
  await expect(pageSize).toBeVisible({ timeout: 20_000 });
  if ((await pageSize.textContent())?.trim() === '50') return;
  // MUI's Select opens on pointer-down, so a real click is needed rather than
  // the `tap` helper's synthetic click, which never opens the listbox.
  // `force` because on the narrow mobile viewport the 50-row option renders
  // underneath the selected 25-row option, and the strict click action would
  // otherwise wait forever on a hit-test interception that never clears.
  await pageSize.click();
  await page.getByRole('option', { name: '50', exact: true }).click({ force: true, timeout: 20_000 });
  // MUI renders the current page size as the select's text content, not as an
  // attribute, so the table having reloaded with the wider page is what to wait on.
  await expect(pageSize).toHaveText('50', { timeout: 20_000 });
}

/**
 * Selects a real option in the MUI Autocomplete option pickers (supplier,
 * warehouse, SKU, receipt location). The picker searches the API by code/name,
 * so the code is typed and the returned option is chosen from the real listbox.
 */
async function pickOption(page: Page, input: Locator, code: string) {
  await input.fill(code);
  const option = page.getByRole('option', { name: new RegExp(escapeRegExp(code)) }).first();
  await expect(option).toBeVisible();
  await tap(option);
  await expect(input).toHaveValue(new RegExp(escapeRegExp(code)));
}

/**
 * Reads the balance and the whole movement chain for one SKU x location
 * through the ledger screen. The table shows the newest movement first, so the
 * rows are reversed into chronological order before being asserted. The
 * movement-row count doubles as the "no unexpected rows" guard.
 */
async function readLedger(
  page: Page,
  filters: LedgerFilters,
  expectedMovements: number,
): Promise<{ balance: LedgerBalance; movements: LedgerRow[] }> {
  await navigate(page, 'موجودی و گردش', /\/inventory/);
  await page.getByRole('textbox', { name: 'شناسه انبار' }).fill(filters.warehouseId);
  await page.getByRole('textbox', { name: 'شناسه مکان' }).fill(filters.locationId);
  await page.getByRole('textbox', { name: 'شناسه SKU' }).fill(filters.variantId);
  await tap(page.getByRole('button', { name: 'اعمال فیلتر' }));

  const balanceRow = page
    .getByRole('table', { name: 'ماندهٔ موجودی' })
    .getByRole('row', { name: new RegExp(escapeRegExp(filters.variantId)) });
  await expect(balanceRow).toBeVisible();
  const balance: LedgerBalance = {
    onHand: parseLedgerNumber(await balanceRow.getByRole('cell').nth(3).innerText()),
    reserved: parseLedgerNumber(await balanceRow.getByRole('cell').nth(4).innerText()),
    available: parseLedgerNumber(await balanceRow.getByRole('cell').nth(5).innerText()),
    version: parseLedgerNumber(await balanceRow.getByRole('cell').nth(6).innerText()),
  };

  const ledgerRows = page.getByRole('table', { name: 'گردش دفترکل موجودی' }).getByRole('row');
  await expect(ledgerRows).toHaveCount(expectedMovements + 1);

  const movements: LedgerRow[] = [];
  for (let index = 1; index <= expectedMovements; index += 1) {
    const row = ledgerRows.nth(index);
    const [before, after] = (await row.getByRole('cell').nth(6).innerText()).split('←');
    movements.push({
      type: (await row.getByRole('cell').nth(1).innerText()).trim(),
      quantity: parseLedgerNumber(await row.getByRole('cell').nth(5).innerText()),
      before: parseLedgerNumber(before ?? ''),
      after: parseLedgerNumber(after ?? ''),
      reason: (await row.getByRole('cell').nth(7).innerText()).trim(),
    });
  }
  return { balance, movements };
}

/**
 * Asserts the accepted reconciliation criterion for one SKU x location: exactly
 * the expected physical effects, in a chain that starts at zero, hands each
 * effect to the next row and ends on the final on-hand quantity.
 */
function expectReconciledChain(
  ledger: { balance: LedgerBalance; movements: LedgerRow[] },
  expected: { type: string; quantity: number; reason?: string }[],
) {
  const ordered = [...ledger.movements].reverse();
  expect(ordered).toHaveLength(expected.length);

  let previousAfter = 0;
  ordered.forEach((movement, index) => {
    const wanted = expected[index];
    if (!wanted) return;
    expect(movement.type).toBe(wanted.type);
    expect(movement.quantity).toBe(wanted.quantity);
    expect(movement.before).toBe(previousAfter);
    expect(movement.after).toBe(previousAfter + movement.quantity);
    if (wanted.reason !== undefined) expect(movement.reason).toBe(wanted.reason);
    previousAfter = movement.after;
  });

  const signedTotal = ledger.movements.reduce((sum, movement) => sum + movement.quantity, 0);
  expect(signedTotal).toBe(ledger.balance.onHand);
  expect(previousAfter).toBe(ledger.balance.onHand);
  expect(ledger.balance.available).toBe(ledger.balance.onHand - ledger.balance.reserved);
}

async function createLocation(
  page: Page,
  warehouseCode: string,
  warehouseName: string,
  locationCode: string,
  locationName: string,
): Promise<{ warehouseId: string; locationId: string }> {
  await navigate(page, 'انبارها', /\/warehouses$/);
  await useLargestPageSize(page);
  const warehouseRow = page.getByRole('row', { name: new RegExp(escapeRegExp(warehouseCode)) });
  if (!(await warehouseRow.isVisible().catch(() => false))) {
    await tap(page.getByRole('button', { name: 'انبار جدید' }));
    const warehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
    await warehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(warehouseCode);
    await warehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill(warehouseName);
    await tap(warehouseDialog.getByRole('button', { name: 'ذخیره' }));
    await expect(warehouseDialog).toBeHidden();
  }
  await expect(warehouseRow).toBeVisible();
  const warehouseHref = await warehouseRow.getByRole('link', { name: 'موجودی' }).first().getAttribute('href');
  const warehouseId = new URL(warehouseHref ?? '', 'http://localhost').searchParams.get('warehouseId');
  expect(warehouseId).toBeTruthy();

  const locationRow = page.getByRole('row', { name: new RegExp(escapeRegExp(locationCode)) });
  if (!(await locationRow.isVisible().catch(() => false))) {
    await tap(warehouseRow.getByRole('button', { name: 'مکان‌ها' }));
    await tap(page.getByRole('button', { name: 'مکان جدید' }));
    const locationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
    await locationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(locationCode);
    await locationDialog.getByRole('textbox', { name: 'نام', exact: true }).fill(locationName);
    await tap(locationDialog.getByRole('button', { name: 'ذخیره' }));
    await expect(locationDialog).toBeHidden();
  }
  await expect(locationRow).toBeVisible();
  const locationHref = await locationRow.getByRole('link', { name: 'موجودی' }).getAttribute('href');
  const ids = new URL(locationHref ?? '', 'http://localhost').searchParams;
  expect(ids.get('warehouseId')).toBe(warehouseId);
  return { warehouseId: warehouseId ?? '', locationId: ids.get('locationId') ?? '' };
}

async function receiveInto(page: Page, orderDialog: Locator, reference: string, locationCode: string, quantity: string) {
  await tap(orderDialog.getByRole('button', { name: 'ثبت دریافت کالا' }));
  const receiptDialog = page.getByRole('dialog', { name: /^ثبت دریافت کالا برای/ });
  await expect(receiptDialog).toBeVisible();
  await receiptDialog.getByRole('textbox', { name: 'شمارهٔ حوالهٔ تأمین‌کننده' }).fill(reference);
  await expect(receiptDialog.getByRole('combobox', { name: 'SKU ردیف 1' })).toContainText(/PUR-E2E-/);
  await pickOption(page, receiptDialog.getByRole('combobox', { name: 'مکان انبار ردیف 1' }), locationCode);
  await receiptDialog.getByRole('spinbutton', { name: 'تعداد واقعی' }).fill(quantity);
  await tap(receiptDialog.getByRole('button', { name: 'ثبت رسید و افزایش موجودی' }));
  await expect(receiptDialog).toBeHidden();
}

test('purchase receipts, adjustment, consumed reservation and a transfer reconcile against the exact movement chain', async ({ page }) => {
  test.setTimeout(300_000);
  // Approving a purchase order is guarded by a native confirm; accept it like an
  // operator instead of dismissing it and losing the transition.
  page.on('dialog', dialog => void dialog.accept());

  await signInDiAsAdmin(page);
  const suffix = Date.now().toString(36);
  const sku = `PUR-E2E-${suffix}`;
  const productName = `کالای خرید ${suffix}`;
  const supplierCode = `PUR-SUP-${suffix.toUpperCase()}`;
  const sourceWarehouseCode = `PUR-WH-${suffix}`;
  const targetWarehouseCode = `PUR-DST-${suffix}`;

  // --- a real, published product with one real variant -------------------
  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(productName);
  await page.locator('#product-slug').fill(`purchasing-e2e-${suffix}`);
  await page.locator('#variant-0-sku').fill(sku);
  await page.locator('#variant-0-cost').fill('120000');
  await page.locator('#variant-0-sale').fill('175000');
  await tap(page.getByRole('button', { name: 'ثبت کالا' }));
  await expect(page).toHaveURL(/\/catalog\/products\/(?!new(?:\/|$))[^/]+$/);
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();
  await navigate(page, 'کالا و SKU', /\/catalog$/);
  const productRow = page.getByRole('row', { name: new RegExp(escapeRegExp(productName)) });
  await expect(productRow).toBeVisible();

  // Publishing requires one ready primary image; upload a real asset and wait
  // for the media worker to reach READY through the media manager.
  await tap(productRow.getByRole('link', { name: 'رسانه' }));
  await expect(page).toHaveURL(/\/catalog\/products\/[^/]+\/media$/);
  await expect(page.getByText('هنوز تصویری ثبت نشده')).toBeVisible({ timeout: 30_000 });
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_IMAGE);
  // "آماده" is the READY chip; processing is worker-driven and polled by the UI.
  await expect(page.getByText('آماده', { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.goBack();
  await expect(page).toHaveURL(/\/catalog$/);

  await tap(productRow.getByRole('button', { name: `اقدامات ${productName}` }));
  await tap(page.getByRole('menuitem', { name: 'انتشار' }));
  await expect(productRow.getByText('منتشرشده')).toBeVisible();

  await tap(page.locator('a[href^="/catalog/products/"]', { hasText: productName }).first());
  await expect(page).toHaveURL(/\/catalog\/products\/[^/]+$/);
  const skuInventoryHref = await page
    .locator('a[href^="/inventory?variantId="]')
    .first()
    .getAttribute('href');
  const variantId = new URL(skuInventoryHref ?? '', 'http://localhost').searchParams.get('variantId');
  expect(variantId).toBeTruthy();

  // --- two warehouses: the receiving one with two active locations --------
  const sourceLocationA = await createLocation(page, sourceWarehouseCode, `انبار تأمین ${suffix}`, `PUR-LOC-A-${suffix}`, 'مبدأ');
  const sourceLocationB = await createLocation(page, sourceWarehouseCode, `انبار تأمین ${suffix}`, `PUR-LOC-B-${suffix}`, 'دوم');
  const targetLocation = await createLocation(page, targetWarehouseCode, `انبار تحویل ${suffix}`, `PUR-DST-LOC-${suffix}`, 'مقصد');

  // --- a real supplier ---------------------------------------------------
  await navigate(page, 'تأمین‌کنندگان', /\/suppliers$/);
  await useLargestPageSize(page);
  await tap(page.getByRole('button', { name: 'تأمین‌کننده جدید' }));
  const supplierDialog = page.getByRole('dialog', { name: 'تأمین‌کننده جدید' });
  await supplierDialog.getByRole('textbox', { name: 'کد تأمین‌کننده' }).fill(supplierCode);
  await supplierDialog.getByRole('textbox', { name: 'نام تأمین‌کننده' }).fill(`تأمین‌کنندهٔ آزمون ${suffix}`);
  await tap(supplierDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(supplierDialog).toBeHidden();
  await expect(page.getByRole('row', { name: new RegExp(escapeRegExp(supplierCode)) })).toBeVisible();

  // --- purchase order: approved, partially received, then received --------
  await navigate(page, 'سفارش‌های خرید', /\/purchase-orders$/);
  await tap(page.getByRole('button', { name: 'سفارش جدید' }));
  const orderForm = page.getByRole('dialog', { name: 'سفارش خرید جدید' });
  await pickOption(page, orderForm.getByRole('combobox', { name: 'تأمین‌کننده' }), supplierCode);
  await pickOption(page, orderForm.getByRole('combobox', { name: 'انبار مقصد' }), sourceWarehouseCode);
  await pickOption(page, orderForm.getByRole('combobox', { name: 'SKU ردیف 1' }), sku);
  await orderForm.getByRole('spinbutton', { name: 'تعداد' }).fill('7');
  await orderForm.getByRole('textbox', { name: 'بهای واحد (ریال)' }).fill('120000');
  await tap(orderForm.getByRole('button', { name: 'ایجاد پیش‌نویس' }));

  const orderDialog = page.getByRole('dialog', { name: /^سفارش خرید PO-/ });
  await expect(orderDialog).toBeVisible();
  await expect(orderDialog.getByText('پیش‌نویس', { exact: true })).toBeVisible();
  await tap(orderDialog.getByRole('button', { name: 'تأیید سفارش' }));
  await expect(orderDialog.getByText('تأییدشده', { exact: true })).toBeVisible();

  const firstReference = `PO-RC1-${suffix}`;
  const secondReference = `PO-RC2-${suffix}`;
  await receiveInto(page, orderDialog, firstReference, `PUR-LOC-A-${suffix}`, '4');
  await expect(orderDialog.getByText('دریافت ناقص', { exact: true })).toBeVisible();
  await receiveInto(page, orderDialog, secondReference, `PUR-LOC-B-${suffix}`, '3');
  await expect(orderDialog.getByText('دریافت‌شده', { exact: true })).toBeVisible();

  // Fully received: received quantity equals ordered quantity in the line.
  const orderLines = orderDialog.getByRole('table', { name: 'اقلام سفارش خرید' }).getByRole('row');
  await expect(orderLines).toHaveCount(2);
  await expect(orderLines.nth(1)).toContainText('۷');

  // Both receipts must show their external reference, their actor and one
  // ledger movement per received line: receipt rows are attributable, not
  // unattributed balance edits.
  const orderText = await orderDialog.innerText();
  expect(orderText).toContain(`حواله: ${firstReference}`);
  expect(orderText).toContain(`حواله: ${secondReference}`);
  const receiptActors = [...orderText.matchAll(/ثبت‌کننده:\s*(\S+)/gu)].map(match => match[1] ?? '');
  const receiptMovementIds = [...orderText.matchAll(/گردش:\s*([0-9a-z-]+)/giu)].map(match => match[1] ?? '');
  const receiptQuantities = [...orderText.matchAll(/تعداد:\s*([۰-۹٠-٩٬]+)/gu)].map(match => parseLedgerNumber(match[1] ?? ''));
  expect(receiptActors).toHaveLength(2);
  expect(receiptActors.every(actor => actor.length > 0)).toBe(true);
  expect(receiptMovementIds).toHaveLength(2);
  expect(new Set(receiptMovementIds).size).toBe(2);
  expect(receiptQuantities).toHaveLength(2);
  expect(receiptQuantities.reduce((sum, quantity) => sum + quantity, 0)).toBe(7);

  // The modal aria-hides the shell background, which would make the sidebar
  // links unfindable for the ledger navigation below, so close it first.
  await tap(orderDialog.getByRole('button', { name: 'بستن' }));
  await expect(orderDialog).toBeHidden();

  // --- a downward manual adjustment on the first receiving location ------
  const sourceFilters: LedgerFilters = {
    warehouseId: sourceLocationA.warehouseId,
    locationId: sourceLocationA.locationId,
    variantId: variantId ?? '',
  };
  let ledger = await readLedger(page, sourceFilters, 1);
  expectReconciledChain(ledger, [{ type: 'رسید', quantity: 4 }]);

  const sourceBalanceRow = page
    .getByRole('table', { name: 'ماندهٔ موجودی' })
    .getByRole('row', { name: new RegExp(escapeRegExp(variantId ?? '')) });
  await tap(sourceBalanceRow.getByRole('button', { name: 'رسید/تعدیل' }));
  const adjustmentDialog = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
  await expect(adjustmentDialog).toBeVisible();
  await expect(adjustmentDialog.getByRole('textbox', { name: 'شناسه SKU' })).toHaveValue(variantId ?? '');
  expect(Number(await adjustmentDialog.getByRole('textbox', { name: 'نسخهٔ مانده' }).inputValue())).toBe(
    ledger.balance.version,
  );
  await adjustmentDialog.getByRole('combobox', { name: 'نوع تغییر' }).dispatchEvent('mousedown');
  await tap(page.getByRole('option', { name: 'تعدیل کاهشی (−)' }));
  await adjustmentDialog.getByRole('textbox', { name: 'تعداد' }).fill('1');
  await adjustmentDialog.getByRole('textbox', { name: 'دلیل' }).fill('اصلاح شمارش آزمون خرید');
  await tap(adjustmentDialog.getByRole('button', { name: 'ثبت تغییر' }));
  await expect(adjustmentDialog).toBeHidden();

  // Re-read the ledger so the reservation carries the post-adjustment version.
  ledger = await readLedger(page, sourceFilters, 2);
  expectReconciledChain(ledger, [
    { type: 'رسید', quantity: 4 },
    { type: 'تعدیل کاهشی', quantity: -1, reason: 'اصلاح شمارش آزمون خرید' },
  ]);

  // --- reserve and consume one unit on the same location ----------------
  await tap(sourceBalanceRow.getByRole('link', { name: 'رزروها' }));
  await expect(page).toHaveURL(/\/reservations\?warehouseId=/);
  const reservationTable = page.getByRole('table', { name: 'رزروهای موجودی' });
  await expect(reservationTable.getByRole('row').filter({ hasText: 'فعال' })).toHaveCount(0);
  await expect(reservationTable.getByRole('row').filter({ hasText: 'مصرف‌شده' })).toHaveCount(0);
  await tap(page.getByRole('button', { name: 'رزرو دستی' }));
  const reservationDialog = page.getByRole('dialog', { name: 'رزرو دستی موجودی' });
  await expect(reservationDialog.getByRole('textbox', { name: 'شناسه SKU' })).toHaveValue(variantId ?? '');
  expect(Number(await reservationDialog.getByRole('textbox', { name: 'نسخهٔ مانده' }).inputValue())).toBe(
    ledger.balance.version,
  );
  await reservationDialog.getByRole('textbox', { name: 'تعداد' }).fill('1');
  await reservationDialog.locator('input[type="datetime-local"]').fill('2099-01-01T12:00');
  await tap(reservationDialog.getByRole('button', { name: 'ثبت رزرو' }));
  await expect(reservationDialog).toBeHidden();

  const activeReservation = reservationTable
    .getByRole('row')
    .filter({ hasText: 'فعال' })
    .filter({ hasText: 'دستی' });
  await expect(activeReservation).toHaveCount(1);
  await tap(activeReservation.getByRole('button', { name: 'مصرف' }));
  const consumeDialog = page.getByRole('dialog', { name: 'مصرف رزرو دستی' });
  await expect(consumeDialog.getByText(/نسخهٔ مانده:/)).toBeVisible();
  await tap(consumeDialog.getByRole('button', { name: 'تأیید مصرف' }));
  await expect(consumeDialog).toBeHidden();
  await expect(reservationTable.getByRole('row')).toHaveCount(2);
  await expect(reservationTable.getByRole('row').filter({ hasText: 'مصرف‌شده' })).toHaveCount(1);

  // --- move one unit to the second warehouse ----------------------------
  await navigate(page, 'انتقال‌ها', /\/transfers$/);
  await tap(page.getByRole('link', { name: 'انتقال جدید' }));
  await expect(page).toHaveURL(/\/transfers\/new$/);
  await page.getByRole('textbox', { name: 'کد انتقال (اختیاری)' }).fill(`PUR-TRF-${suffix}`);
  await page.getByRole('textbox', { name: 'شناسه انبار مبدأ' }).fill(sourceLocationA.warehouseId);
  await page.getByRole('textbox', { name: 'شناسه انبار مقصد' }).fill(targetLocation.warehouseId);
  await page.getByRole('textbox', { name: 'شناسه SKU ردیف 1' }).fill(variantId ?? '');
  await page.getByRole('textbox', { name: 'تعداد ردیف 1' }).fill('1');
  await page.getByRole('textbox', { name: 'شناسه مکان مبدأ ردیف 1' }).fill(sourceLocationA.locationId);
  await page.getByRole('textbox', { name: 'شناسه مکان مقصد ردیف 1' }).fill(targetLocation.locationId);
  await tap(page.getByRole('button', { name: 'ساخت پیش‌نویس' }));
  await expect(page).toHaveURL(/\/transfers\/[^/]+$/);
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

  // --- the accepted reconciliation, with the purchasing path included ----
  ledger = await readLedger(page, sourceFilters, 4);
  expectReconciledChain(ledger, [
    { type: 'رسید', quantity: 4 },
    { type: 'تعدیل کاهشی', quantity: -1, reason: 'اصلاح شمارش آزمون خرید' },
    { type: 'فروش', quantity: -1 },
    { type: 'انتقال خروجی', quantity: -1 },
  ]);
  expect(ledger.balance.onHand).toBe(1);
  expect(ledger.balance.reserved).toBe(0);
  expect(ledger.balance.available).toBe(1);

  const secondLocation = await readLedger(
    page,
    { warehouseId: sourceLocationA.warehouseId, locationId: sourceLocationB.locationId, variantId: variantId ?? '' },
    1,
  );
  expectReconciledChain(secondLocation, [{ type: 'رسید', quantity: 3 }]);
  expect(secondLocation.balance.onHand).toBe(3);
  expect(secondLocation.balance.reserved).toBe(0);
  expect(secondLocation.balance.available).toBe(3);

  const target = await readLedger(
    page,
    { warehouseId: targetLocation.warehouseId, locationId: targetLocation.locationId, variantId: variantId ?? '' },
    1,
  );
  expectReconciledChain(target, [{ type: 'انتقال ورودی', quantity: 1 }]);
  expect(target.balance.onHand).toBe(1);
  expect(target.balance.reserved).toBe(0);
  expect(target.balance.available).toBe(1);

  // Both purchase receipts are ledger rows: the two رسید movements above are
  // exactly the two PurchaseReceiptLine movements of the order.
  const receiptMovements = ledger.movements
    .concat(secondLocation.movements)
    .filter(movement => movement.type === 'رسید');
  expect(receiptMovements).toHaveLength(2);
  expect(receiptMovements.reduce((sum, movement) => sum + movement.quantity, 0)).toBe(
    receiptQuantities.reduce((sum, quantity) => sum + quantity, 0),
  );

  // No open reservation is left behind: the consumed one is still present, but
  // there is nothing left in 'فعال' for this variant in this location. Bring
  // the source location back onto the ledger, then open its reservations.
  await readLedger(page, sourceFilters, 4);
  await tap(sourceBalanceRow.getByRole('link', { name: 'رزروها' }));
  await expect(page).toHaveURL(/\/reservations\?warehouseId=/);
  await expect(reservationTable.getByRole('row')).toHaveCount(2);
  await expect(reservationTable.getByRole('row').filter({ hasText: 'فعال' })).toHaveCount(0);
  await expect(reservationTable.getByRole('row').filter({ hasText: 'مصرف‌شده' })).toHaveCount(1);
});
