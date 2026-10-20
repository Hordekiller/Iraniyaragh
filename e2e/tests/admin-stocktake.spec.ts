import { expect, test, type Page } from '@playwright/test';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';
import type { InventoryBalanceListResponse, InventoryMovementListResponse } from '../../packages/contracts/src/inventory';
import type { StocktakeDetail } from '../../packages/contracts/src/stocktake';

const quantity = new Intl.NumberFormat('fa-IR');

async function navigate(page: Page, name: string, url: RegExp) {
  const link = adminSidebar(page).getByRole('link', { name, exact: true });
  if (!(await link.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(link); await expect(page).toHaveURL(url);
}

test('operator reconciles upward and downward physical counts across two locations with the exact immutable ledger', async ({ page }) => {
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
  const locationsUrl = page.url();
  const locations = [
    { code: `ST-UP-${suffix}`, initial: 5, counted: 7, locationId: '', inventoryUrl: '' },
    { code: `ST-DOWN-${suffix}`, initial: 8, counted: 6, locationId: '', inventoryUrl: '' },
  ];
  for (const location of locations) {
    await tap(page.getByRole('button', { name: 'مکان جدید' }));
    const dialog = page.getByRole('dialog', { name: 'مکان جدید' });
    await dialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(location.code);
    await tap(dialog.getByRole('button', { name: 'ذخیره' }));
    await expect(dialog).toBeHidden();
    const row = page.getByRole('row').filter({ hasText: location.code });
    const href = await row.getByRole('link', { name: 'موجودی' }).getAttribute('href');
    expect(href).toBeTruthy();
    location.inventoryUrl = new URL(href!, locationsUrl).href;
    location.locationId = new URL(location.inventoryUrl).searchParams.get('locationId')!;
    expect(location.locationId).toBeTruthy();
  }
  for (const location of locations) {
    await page.goto(location.inventoryUrl);
    await tap(page.getByRole('button', { name: 'رسید یا تعدیل' }));
    const receipt = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
    await receipt.getByRole('textbox', { name: 'شناسه SKU' }).fill(variantId);
    await receipt.getByRole('textbox', { name: 'تعداد' }).fill(String(location.initial));
    await tap(receipt.getByRole('button', { name: 'ثبت تغییر' }));
    await expect(receipt).toBeHidden();
    const balance = page.getByRole('table', { name: 'ماندهٔ موجودی' }).getByRole('row').filter({ hasText: variantId });
    await expect(balance.getByRole('cell').nth(3)).toHaveText(quantity.format(location.initial));
  }

  await navigate(page, 'انبارگردانی', /\/stocktakes$/);
  await tap(page.getByRole('button', { name: 'برگهٔ جدید' }));
  const create = page.getByRole('dialog', { name: 'برگهٔ جدید انبارگردانی' });
  await create.getByRole('combobox', { name: 'انبار', exact: true }).fill(warehouseCode);
  await tap(page.getByRole('option').filter({ hasText: warehouseCode }));
  await tap(create.getByRole('button', { name: 'ثبت برگه' }));
  await expect(page).toHaveURL(/\/stocktakes\/[^/]+$/);
  await tap(page.getByRole('button', { name: 'آغاز شمارش' }));
  const countTable = page.getByRole('table', { name: 'برگهٔ شمارش' });
  await expect(countTable.getByRole('textbox', { name: `مقدار شمارش ${sku}` })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeDisabled();
  // Persist separate partial batches, so reload cannot hide an unsaved second line.
  for (const [index, location] of locations.entries()) {
    const row = countTable.getByRole('row').filter({ hasText: location.code });
    await row.getByRole('textbox', { name: `مقدار شمارش ${sku}` }).fill(quantity.format(location.counted));
    await tap(page.getByRole('button', { name: /ثبت .*خط/ }));
    if (index === 0) await expect(page.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeDisabled();
    else await expect(page.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeEnabled();
    await page.reload();
    await expect(row.getByRole('cell').nth(5)).toHaveText(quantity.format(location.counted));
  }
  for (const location of locations) {
    const row = countTable.getByRole('row').filter({ hasText: location.code });
    await expect(row.getByRole('cell').nth(3)).toHaveText(quantity.format(location.initial));
    await expect(row.getByRole('cell').nth(4)).toHaveText(quantity.format(location.counted - location.initial));
    await expect(row.getByRole('cell').nth(5)).toHaveText(quantity.format(location.counted));
  }
  await tap(page.getByRole('button', { name: 'ارسال برای بازبینی' }));
  await expect(countTable.getByRole('textbox', { name: `مقدار شمارش ${sku}` })).toHaveCount(0);
  const approvedResponse = page.waitForResponse(response =>
    response.request().method() === 'POST' && /\/api\/v1\/stocktakes\/[^/]+\/approve$/u.test(new URL(response.url()).pathname));
  await tap(page.getByRole('button', { name: 'تأیید و اعمال روی دفترکل' }));
  const approved = await approvedResponse;
  expect(approved.status()).toBe(201);
  const completed = await approved.json() as StocktakeDetail;
  expect(completed.status).toBe('COMPLETED');
  expect(completed.lines).toHaveLength(2);
  expect(completed.summary).toMatchObject({ totalLines: 2, countedLines: 2, pendingLines: 0, netDifference: 0 });
  await expect(page.getByText('موجودی این برگه روی دفترکل اعمال شده و برگه تغییرناپذیر است.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'لغو برگه' })).toHaveCount(0);
  await expect(page.getByRole('table', { name: 'تاریخچهٔ انبارگردانی' })).toContainText('تأیید و ثبت دفترکل');
  for (const location of locations) {
    const line = completed.lines.find(item => item.locationId === location.locationId);
    expect(line).toMatchObject({ variantId, expectedQty: location.initial, countedQty: location.counted,
      difference: location.counted - location.initial });
    expect(line!.movementId).toBeTruthy();
    await expect(countTable.getByRole('row').filter({ hasText: location.code })).toContainText(line!.movementId!);
  }
  // Observe the normal UI's real GET responses; all mutations above use screens.
  // Exact row counts and links prevent an extra/duplicate effect from hiding in a total.
  for (const location of locations) {
    const isScopedRead = (url: string, path: string) => {
      const parsed = new URL(url);
      return parsed.pathname === path && parsed.searchParams.get('locationId') === location.locationId;
    };
    const balancesResponse = page.waitForResponse(response => response.request().method() === 'GET'
      && isScopedRead(response.url(), '/api/v1/inventory/balances'));
    const movementsResponse = page.waitForResponse(response => response.request().method() === 'GET'
      && isScopedRead(response.url(), '/api/v1/inventory/movements'));
    await page.goto(location.inventoryUrl);
    const balances = await balancesResponse;
    const movements = await movementsResponse;
    expect(balances.status()).toBe(200);
    expect(movements.status()).toBe(200);
    const balancePage = await balances.json() as InventoryBalanceListResponse;
    const movementPage = await movements.json() as InventoryMovementListResponse;
    expect(balancePage.count).toBe(1);
    expect(balancePage.items).toHaveLength(1);
    expect(balancePage.items[0]).toMatchObject({ warehouseId: completed.warehouseId,
      locationId: location.locationId, variantId, onHand: location.counted, reserved: 0, available: location.counted });
    expect(balancePage.items[0].available).toBe(balancePage.items[0].onHand - balancePage.items[0].reserved);
    expect(movementPage.count).toBe(2);
    expect(movementPage.items).toHaveLength(2);
    const receipt = movementPage.items.find(item => item.type === 'RECEIPT');
    const variance = movementPage.items.find(item => item.type === 'STOCKTAKE');
    const line = completed.lines.find(item => item.locationId === location.locationId)!;
    expect(receipt).toMatchObject({ warehouseId: completed.warehouseId, locationId: location.locationId,
      variantId, quantity: location.initial, beforeOnHand: 0, afterOnHand: location.initial });
    expect(variance).toMatchObject({ id: line.movementId, warehouseId: completed.warehouseId,
      locationId: location.locationId, variantId, quantity: location.counted - location.initial,
      beforeOnHand: receipt!.afterOnHand, afterOnHand: location.counted,
      referenceType: 'StocktakeItem', referenceId: line.id });
    expect(movementPage.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(balancePage.items[0].onHand);
    const ledger = page.getByRole('table', { name: 'گردش دفترکل موجودی' });
    await expect(ledger.getByRole('row').filter({ hasText: 'انبارگردانی' })).toHaveCount(1);
    await expect(ledger.getByRole('row').filter({ hasText: 'انبارگردانی' })).toContainText(`Physical count approved for ${completed.number}`);
    const balanceRow = page.getByRole('table', { name: 'ماندهٔ موجودی' }).getByRole('row').filter({ hasText: variantId });
    await expect(balanceRow.getByRole('cell').nth(3)).toHaveText(quantity.format(location.counted));
    await expect(balanceRow.getByRole('cell').nth(4)).toHaveText(quantity.format(0));
    await expect(balanceRow.getByRole('cell').nth(5)).toHaveText(quantity.format(location.counted));
  }
});
