import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { adminSidebar, signInDiAsAdmin, tap } from './helpers';

const rial = new Intl.NumberFormat('fa-IR');
const SAMPLE_IMAGE = resolve(__dirname, '../../apps/web/public/images/hero1.jpg');

/** Renders an amount exactly the way the admin `formatRial` helper does. */
const formatRial = (amount: number): string => `${rial.format(BigInt(amount))} ریال`;

async function navigate(page: Page, name: string, pattern: RegExp, heading?: string) {
  // `getByRole` name matching is substring-based by default, and "سفارش‌ها"
  // is a substring of "سفارش‌های خرید", so navigation must be exact.
  const link = adminSidebar(page).getByRole('link', { name, exact: true });
  if (!(await link.isVisible().catch(() => false))) await tap(page.getByRole('button', { name: 'باز کردن منو' }));
  await tap(link);
  await expect(page).toHaveURL(pattern);
  // A URL change alone is not proof the destination rendered; Next.js can
  // still be settling a previous route. Wait for the page's own heading.
  if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}

/**
 * Chooses an option from a server-backed staff order autocomplete. The
 * suggestions come from `GET /orders/admin/options`, so the operator types a
 * real name/mobile or SKU and picks from what the server actually returned.
 */
async function pickSuggestion(page: Page, label: string, query: string) {
  // MUI renders required labels as "مشتری *", so exact matching would fail.
  const input = page.getByLabel(label);
  // Wait for the lookup this keystroke causes. Without it the picker would
  // still be showing the previous query's suggestions and the click could land
  // on a stale customer or SKU.
  const response = page.waitForResponse((res) =>
    res.url().includes('/orders/admin/options'),
  );
  await input.fill(query);
  await response;

  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  // A unique identifier must narrow the server-side list to a single record.
  await expect(listbox.getByRole('option')).toHaveCount(1);
  await listbox.getByRole('option').first().click();
  // The control must show the chosen option, not the raw search text.
  await expect(input).not.toHaveValue(query);
}

async function selectProvince(page: Page, province: string) {
  // A real click is required here: MUI's select opens on mousedown, so a
  // synthetic dispatchEvent('click') never opens the menu.
  await page.getByLabel('استان').click();
  await page.getByRole('option', { name: province, exact: true }).click();
}

/**
 * Creates an active product with one sellable variant that has real stock.
 *
 * The staff order journey deliberately builds its own prerequisites through the
 * real UI instead of reaching into the database or a fixture, so the order is
 * reserved against stock that the inventory ledger genuinely recorded.
 */
async function createSellableVariantWithStock(page: Page, suffix: string) {
  const sku = `STAFF-E2E-${suffix}`;
  const salePrice = 150_000;

  await navigate(page, 'کالا و SKU', /\/catalog$/);
  await tap(page.locator('a[href="/catalog/products/new"]'));
  await page.locator('#product-name').fill(`کالای سفارش حضوری ${suffix}`);
  await page.locator('#product-slug').fill(`staff-order-e2e-${suffix}`);
  await page.locator('#variant-0-sku').fill(sku);
  await page.locator('#variant-0-cost').fill('100000');
  await page.locator('#variant-0-sale').fill(String(salePrice));

  await tap(page.getByRole('button', { name: 'ثبت کالا' }));
  await expect(page).toHaveURL(/\/catalog\/products\/(?!new(?:\/|$))[^/]+$/);
  await expect(page.getByRole('heading', { name: `کالای سفارش حضوری ${suffix}` })).toBeVisible();

  // Create stays DRAFT-only. Upload a real image through the media manager and
  // publish only through the lifecycle command before it becomes orderable.
  await tap(page.getByRole('link', { name: /مدیریت رسانه/u }));
  await expect(page).toHaveURL(/\/catalog\/products\/[^/]+\/media$/);
  await page.locator('input[type="file"]').setInputFiles(SAMPLE_IMAGE);
  await expect(page.getByText('آماده', { exact: true }).first()).toBeVisible({ timeout: 120_000 });
  await navigate(page, 'کالا و SKU', /\/catalog$/);
  const productRow = page.locator('tr', { hasText: `کالای سفارش حضوری ${suffix}` });
  await expect(productRow).toBeVisible();
  await tap(productRow.getByRole('link', { name: `کالای سفارش حضوری ${suffix}` }));
  await expect(page).toHaveURL(/\/catalog\/products\/(?!new(?:\/|$))[^/]+$/);
  await expect(page.getByRole('button', { name: 'انتشار', exact: true })).toBeVisible();
  await tap(page.getByRole('button', { name: 'انتشار', exact: true }));
  await expect(page.getByText('منتشرشده', { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Open this product's own detail page (other products exist in the catalog) and
  // take the inventory link from the row of the SKU we just created.
  const skuInventoryLink = page
    .locator('tr', { hasText: sku })
    .locator('a[href^="/inventory?variantId="]')
    .first();
  await expect(skuInventoryLink).toBeVisible({ timeout: 15_000 });
  const skuHref = await skuInventoryLink.getAttribute('href');
  const variantId = new URL(skuHref ?? '', 'http://localhost').searchParams.get('variantId');
  expect(variantId).toBeTruthy();

  const initialWarehouses = page.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/inventory/warehouses',
  );
  await navigate(page, 'انبارها', /\/warehouses$/);
  const initialWarehousePage = await initialWarehouses;
  expect(initialWarehousePage.status()).toBe(200);
  await initialWarehousePage.finished();
  await tap(page.getByRole('button', { name: 'انبار جدید' }));
  const warehouseDialog = page.getByRole('dialog', { name: 'انبار جدید' });
  await warehouseDialog.getByRole('textbox', { name: 'کد یکتا' }).fill(`STAFF-WH-${suffix}`);
  await warehouseDialog.getByRole('textbox', { name: 'نام انبار' }).fill('انبار سفارش حضوری');
  const refreshedWarehouses = page.waitForResponse(response =>
    response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/inventory/warehouses',
  );
  await tap(warehouseDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(warehouseDialog).toBeHidden();
  const firstPage = await refreshedWarehouses;
  expect(firstPage.status()).toBe(200);
  let warehousePage = await firstPage.json();
  const pageSize = Number(new URL(firstPage.url()).searchParams.get('limit'));
  expect(pageSize).toBeGreaterThan(0);
  // The real directory is paginated and sorted by code; a newly created
  // warehouse need not be among its first 25 rows. Follow the actual UI pages.
  const pages = Math.ceil(warehousePage.count / pageSize);
  for (let index = 1; index < pages && !warehousePage.items.some((item: { code: string }) => item.code === `STAFF-WH-${suffix}`); index += 1) {
    const next = page.getByRole('button', { name: 'Go to next page', exact: true }).first();
    await expect(next).toBeEnabled();
    const nextPage = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname === '/api/v1/inventory/warehouses' && Number(url.searchParams.get('offset')) === index * pageSize;
    });
    await next.click();
    const response = await nextPage;
    expect(response.status()).toBe(200);
    warehousePage = await response.json();
  }
  const warehouseRow = page.getByRole('row', { name: new RegExp(`STAFF-WH-${suffix}`) });
  await expect(warehouseRow).toBeVisible();
  await tap(warehouseRow.getByRole('button', { name: 'مکان‌ها' }));
  await tap(page.getByRole('button', { name: 'مکان جدید' }));
  const locationDialog = page.getByRole('dialog', { name: 'مکان جدید' });
  await locationDialog.getByRole('textbox', { name: 'کد مکان در انبار' }).fill(`STAFF-LOC-${suffix}`);
  await tap(locationDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(locationDialog).toBeHidden();

  const locationRow = page.getByRole('row', { name: new RegExp(`STAFF-LOC-${suffix}`) });
  await expect(locationRow).toBeVisible();
  await tap(locationRow.getByRole('link', { name: 'موجودی' }));
  await expect(page).toHaveURL(/\/inventory\?warehouseId=/);

  await tap(page.getByRole('button', { name: 'رسید یا تعدیل' }));
  const stockDialog = page.getByRole('dialog', { name: 'ثبت رسید یا تعدیل موجودی' });
  await stockDialog.getByRole('textbox', { name: 'شناسه SKU' }).fill(variantId ?? '');
  await stockDialog.getByRole('textbox', { name: 'تعداد' }).fill('10');
  await tap(stockDialog.getByRole('button', { name: 'ثبت تغییر' }));
  await expect(stockDialog).toBeHidden();

  return { sku, variantId: variantId ?? '', salePrice };
}

async function createCustomer(page: Page, suffix: string) {
  const mobile = `09${suffix}`;
  const canonicalMobile = `+989${suffix}`;

  await navigate(page, 'مشتریان', /\/customers$/);
  await tap(page.getByRole('button', { name: 'مشتری جدید' }));
  const createDialog = page.getByRole('dialog', { name: 'مشتری جدید' });
  await createDialog.getByRole('textbox', { name: 'موبایل' }).fill(mobile);
  await createDialog.getByRole('textbox', { name: 'نام', exact: true }).fill('نگار');
  await createDialog.getByRole('textbox', { name: 'نام خانوادگی' }).fill('سفارش');
  await tap(createDialog.getByRole('button', { name: 'ذخیره' }));
  await expect(createDialog).toBeHidden();

  // The directory list is paginated and filtered through the URL, so asserting
  // on the row here would race the route. The staff order picker below proves
  // the record exists by finding it through a real server query instead.
  return { mobile, canonicalMobile };
}

test('staff records a walk-in order with a server-priced total and a real pending payment state', async ({ page }) => {
  // Building product, stock, warehouse and customer through the real UI is
  // the same shape as the other admin journeys.
  test.setTimeout(420_000);
  await signInDiAsAdmin(page);
  const suffix = Date.now().toString().slice(-9);

  const { sku, variantId, salePrice } = await test.step('prepare sellable stock', () =>
    createSellableVariantWithStock(page, suffix),
  );
  const { mobile, canonicalMobile } = await test.step('register the customer', () =>
    createCustomer(page, suffix),
  );

  await test.step('record the walk-in order', async () => {
  await navigate(page, 'سفارش‌ها', /\/orders$/, 'سفارش‌ها');
  await tap(page.getByRole('button', { name: 'سفارش حضوری' }));
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // The operator picks real records; a raw id is never typed by hand. The
  // options lookup matches digit substrings of the stored E.164 mobile, so the
  // canonical form is what actually finds the customer.
  await pickSuggestion(page, 'مشتری', canonicalMobile);
  await pickSuggestion(page, 'تنوع کالا', sku);

  // No money may be entered at the counter: the server prices the order.
  await expect(dialog.getByLabel(/تخفیف/)).toHaveCount(0);
  await expect(dialog.getByLabel(/قیمت/)).toHaveCount(0);
  await expect(dialog.getByLabel(/مبلغ/)).toHaveCount(0);

  const quantity = dialog.getByLabel('تعداد').first();
  await quantity.fill('2');
  await selectProvince(page, 'تهران');
  await dialog.getByLabel('شهر').fill('تهران');
  await dialog.getByLabel('کد پستی').fill('1234567890');
  await dialog.getByLabel('نشانی').fill('خیابان ولیعصر، پلاک ۱۰');
  await dialog.getByLabel('نام گیرنده').fill('نگار سفارش');
  await dialog.getByLabel('موبایل').fill(mobile);
  await dialog.getByLabel('یادداشت کارمند').fill('یادداشت آزمون سفارش حضوری');

  await tap(dialog.getByRole('button', { name: 'ثبت سفارش' }));
  await expect(dialog).toBeHidden();

  // The order is listed newest-first and priced by the server from the
  // catalog sale price, never from a client-supplied amount.
  const table = page.getByRole('table', { name: 'فهرست سفارش‌ها' });
  const firstRow = table.getByRole('row').nth(1);
  await expect(firstRow).toContainText('در انتظار پرداخت');
  await expect(firstRow).toContainText(formatRial(salePrice * 2));

  // A staff order must not invent a paid state: the payment column stays empty
  // until a real gateway attempt exists.
  await expect(firstRow).toContainText('بدون تلاش پرداخت');
  // Fulfillment is a separate machine and has not started either.
  await expect(firstRow).toContainText('شروع نشده');
  });

  await test.step('the stock is held, not silently spent', async () => {

  // The reservation is real: the ledger no longer shows all ten units free.
  // The balance table identifies a row by variantId (its contract identity), so
  // assert on the ordered variant rather than on the seeded demo SKU.
  await navigate(page, 'موجودی و گردش', /\/inventory/);
  // Query the ordered SKU through the real filter: other journeys may have
  // already filled the first page of the balance directory.
  await page.getByRole('textbox', { name: 'شناسه SKU', exact: true }).fill(variantId);
  await tap(page.getByRole('button', { name: 'اعمال فیلتر', exact: true }));
  const balanceTable = page.getByRole('table', { name: 'ماندهٔ موجودی' });
  const balanceRow = balanceTable.getByRole('row', { name: new RegExp(variantId) });
  await expect(balanceRow).toContainText(rial.format(10));
  await expect(balanceRow).toContainText(rial.format(2));
  await expect(balanceRow).toContainText(rial.format(8));
  // And the reservation is reachable as a hold rather than a silent stock cut.
  await expect(balanceRow.getByRole('link', { name: 'رزروها' })).toBeVisible();
  });
});
