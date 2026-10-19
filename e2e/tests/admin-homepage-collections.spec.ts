import { expect, test } from '@playwright/test';
import { signInDiAsAdmin } from './helpers';

test('staff configures, reloads, and clears an ordered homepage category carousel', async ({ page }) => {
  await signInDiAsAdmin(page);
  await page.goto('/settings/homepage');

  await expect(page.getByRole('heading', { name: 'چیدمان کاروسل صفحهٔ اصلی' })).toBeVisible();
  await expect(page.getByText(/لغوها و مرجوعی ثبت‌شده از رتبه کم می‌شوند/)).toBeVisible();
  await expect(page.getByText(/هنوز کاروسلی انتخاب نشده/)).toBeVisible();

  const save = page.waitForResponse(response => response.url().endsWith('/api/v1/catalog/homepage-collections/admin') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'افزودن دسته‌بندی' }).click();
  await page.getByLabel('ترتیب نمایش').click();
  await page.getByRole('option', { name: 'پرفروش' }).click();
  await page.getByRole('button', { name: 'افزودن پرفروش‌ترین محصولات' }).click();
  await page.getByRole('button', { name: 'ذخیرهٔ چیدمان' }).click();
  expect((await save).status()).toBe(200);
  await expect(page.getByText('چیدمان صفحهٔ اصلی ذخیره شد.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('ترتیب نمایش').first()).toContainText('پرفروش');
  await expect(page.getByLabel('نوع کاروسل').last()).toContainText('همهٔ محصولات');
  await expect(page.getByLabel('ترتیب نمایش').last()).toContainText('پرفروش');

  const clear = page.waitForResponse(response => response.url().endsWith('/api/v1/catalog/homepage-collections/admin') && response.request().method() === 'PUT');
  await page.getByRole('button', { name: 'حذف' }).first().click();
  await page.getByRole('button', { name: 'حذف' }).first().click();
  await page.getByRole('button', { name: 'ذخیرهٔ چیدمان' }).click();
  expect((await clear).status()).toBe(200);
  await expect(page.getByText(/هنوز کاروسلی انتخاب نشده/)).toBeVisible();
});
