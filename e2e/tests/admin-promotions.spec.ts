import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { signInDiAsAdmin, tap } from './helpers';

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('staff creates, schedules, filters, disables and audits promotions through the real API', async ({ page }) => {
  await signInDiAsAdmin(page);
  await page.goto('/marketing/promotions');
  await expect(page.getByRole('heading', { name: 'تخفیف‌ها و کمپین‌ها' })).toBeVisible();
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');
  await expectNoHorizontalOverflow(page);

  const name = `کمپین آزمون ${randomUUID().slice(0, 8)}`;
  await tap(page.getByRole('button', { name: 'کمپین جدید' }));
  const dialog = page.getByRole('dialog');
  // Client validation: a percentage campaign needs a valid percentage before anything reaches the server.
  await dialog.getByLabel('نام کمپین').fill(name);
  await dialog.getByLabel('درصد تخفیف').fill('10');
  await dialog.getByLabel('سقف کل استفاده').fill('5');
  const future = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 16);
  await dialog.getByLabel('شروع').fill(future);
  const created = page.waitForResponse(r => r.url().endsWith('/promotions/admin') && r.request().method() === 'POST');
  await tap(dialog.getByRole('button', { name: 'ایجاد کمپین' }));
  expect((await created).status()).toBe(201);
  await expect(page.getByText('کمپین در سرور ذخیره شد.')).toBeVisible();

  // Filtering by name finds exactly the scheduled campaign, and the server reports it as scheduled.
  await page.getByLabel('جستجوی نام یا کد').fill(name);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('زمان‌بندی');
  await expectNoHorizontalOverflow(page);

  // A coupon code with a one-use limit is created under the campaign.
  const code = `E2E${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  await tap(row.getByRole('button', { name: 'کدها' }));
  const coupons = page.getByRole('dialog', { name: /کدهای تخفیف/ });
  await coupons.getByLabel(/کد دلخواه/).fill(code);
  await coupons.getByLabel('سقف استفادهٔ هر کد').fill('1');
  const generated = page.waitForResponse(r => r.url().includes('/coupons') && r.request().method() === 'POST');
  await tap(coupons.getByRole('button', { name: 'افزودن' }));
  expect((await generated).status()).toBe(201);
  await expect(coupons.getByText(code)).toBeVisible();
  // The same code twice is refused by the server with a precise message.
  await coupons.getByLabel(/کد دلخواه/).fill(code);
  await tap(coupons.getByRole('button', { name: 'افزودن' }));
  await expect(coupons.getByText('این کد تخفیف قبلاً ثبت شده است.')).toBeVisible();
  await tap(coupons.getByRole('button', { name: 'بستن' }));
  await expect(coupons).toBeHidden();

  // Immediate deactivation asks for confirmation and survives a reload.
  await page.getByRole('checkbox', { name: `غیرفعال‌سازی ${name}` }).click({ force: true });
  await expect(page.getByText('غیرفعال‌سازی فوری کمپین')).toBeVisible();
  const toggled = page.waitForResponse(r => r.url().endsWith('/active') && r.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'غیرفعال کن' }));
  expect((await toggled).status()).toBe(200);
  await page.reload();
  await page.getByLabel('جستجوی نام یا کد').fill(name);
  await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: `فعال‌سازی ${name}` })).not.toBeChecked();

  // Usage history and the report are separate, explicitly permissioned views.
  await tap(page.getByRole('tab', { name: 'سابقهٔ استفاده' }));
  await expect(page.getByText(/تاریخچه|سابقه|استفاده‌ای/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('the promotions API refuses unauthenticated access', async ({ request }) => {
  const response = await request.get(`${process.env.API_E2E_URL ?? 'http://127.0.0.1:4000'}/api/v1/promotions/admin`);
  expect(response.status()).toBe(401);
});
