import { expect, test } from '@playwright/test';
import { signInDiAsAdmin, tap } from './helpers';

test('staff persists four non-secret SMS templates through the real Admin API and reloads them', async ({ page }) => {
  await signInDiAsAdmin(page);
  await page.goto('/settings/sms');
  const labels = ['قالب ورود مشتری', 'قالب پرداخت سفارش', 'قالب ارسال مرسوله', 'قالب تحویل مرسوله'];
  await expect(page.getByRole('heading', { name: 'قالب‌های SMS.ir' })).toBeVisible();
  const original = await Promise.all(labels.map(label => page.getByLabel(label).inputValue()));
  const base = 1_000_000 + Number(Date.now().toString().slice(-6));
  const ids = labels.map((_, index) => String(base + index));
  for (const [index, label] of labels.entries()) await page.getByLabel(label).fill(ids[index]!);
  const savedResponse = page.waitForResponse(response => response.url().endsWith('/notifications/admin/sms-settings/templates') && response.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'ذخیرهٔ قالب‌ها' }));
  expect((await savedResponse).status()).toBe(200);
  await expect(page.getByText('شناسه‌های قالب ذخیره شدند؛ تأیید provider و دریافت واقعی پیامک همچنان باید بررسی شوند.')).toBeVisible();
  await page.reload();
  for (const [index, label] of labels.entries()) await expect(page.getByLabel(label)).toHaveValue(ids[index]!);
  await expect(page.getByText(/ذخیرهٔ شناسه‌ها پیامکی ارسال نمی‌کند/)).toBeVisible();
  // Restore the prior non-secret values through the same domain command.
  for (const [index, label] of labels.entries()) await page.getByLabel(label).fill(original[index]!);
  const restoredResponse = page.waitForResponse(response => response.url().endsWith('/notifications/admin/sms-settings/templates') && response.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'ذخیرهٔ قالب‌ها' }));
  expect((await restoredResponse).status()).toBe(200);
});
