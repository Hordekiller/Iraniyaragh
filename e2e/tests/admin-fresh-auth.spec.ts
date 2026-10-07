import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { generate } from 'otplib';
import { isMobile, signInDiAsAdmin, tap } from './helpers';
import { staffCredentials } from './staff-auth';
import { waitForFreshTotpStep } from './totp-step';

/** Only a loopback disposable test DB may adjust time; no auth/provider fixture or API shortcut. */
async function ageTestSession(sessionId: string): Promise<void> {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(database.hostname) || !database.pathname.endsWith('_test')) {
    throw new Error('The fresh-auth browser test requires an isolated loopback *_test database.');
  }
  const require = createRequire(resolve(__dirname, '../../apps/api/package.json'));
  const { PrismaClient } = require('@prisma/client') as {
    PrismaClient: new () => {
      session: { update(input: { where: { id: string }; data: { authenticatedAt: Date } }): Promise<unknown> };
      $disconnect(): Promise<void>;
    };
  };
  const prisma = new PrismaClient();
  try {
    await prisma.session.update({ where: { id: sessionId }, data: { authenticatedAt: new Date(Date.now() - 6 * 60_000) } });
  } finally { await prisma.$disconnect(); }
}

test('real staff refresh, fresh MFA, explicit template resubmit and revoked session', async ({ page }) => {
  const loginResponse = page.waitForResponse(response => response.url().endsWith('/auth/staff/totp/verify') && response.status() === 200);
  await signInDiAsAdmin(page);
  const signedIn = await (await loginResponse).json() as { data: { principal: { sessionId: string } } };
  // Changing the stored auth time invalidates the old signed token. Refresh
  // issues a genuine replacement with the original (aged) authentication time,
  // so passive refresh cannot make a sensitive command fresh again.
  await ageTestSession(signedIn.data.principal.sessionId);
  let refreshes = 0;
  page.on('request', request => { if (request.url().endsWith('/auth/refresh')) refreshes += 1; });
  if (isMobile(page)) await page.getByRole('button', { name: 'باز کردن منو' }).click();
  const smsLink = page.getByRole('link', { name: 'سرویس پیامک', exact: true });
  await expect(smsLink).toBeVisible();
  await tap(smsLink);
  const field = page.getByLabel('قالب ورود مشتری');
  await expect(field).toBeVisible();
  expect(refreshes).toBe(1);
  const original = await field.inputValue();
  const draft = String(3_000_000 + Number(Date.now().toString().slice(-6)));
  await field.fill(draft);
  let writes = 0;
  page.on('request', request => {
    if (request.url().endsWith('/sms-settings/templates') && request.method() === 'PUT') writes += 1;
  });
  const rejected = page.waitForResponse(response => response.url().endsWith('/sms-settings/templates') && response.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'ذخیرهٔ قالب‌ها' }));
  const denial = await rejected;
  expect(denial.status()).toBe(401);
  expect((await denial.json() as { code: string }).code).toBe('AUTH_REAUTHENTICATION_REQUIRED');
  const dialog = page.getByRole('dialog', { name: 'تأیید مجدد عملیات حساس' });
  await expect(dialog).toBeVisible();
  await expect(field).toHaveValue(draft);
  await dialog.getByRole('button', { name: 'فعلاً انصراف' }).click();
  await expect(dialog).toBeHidden();
  await expect(field).toHaveValue(draft);
  expect(writes).toBe(1);
  await page.getByRole('button', { name: 'تأیید مجدد', exact: true }).click();
  const credentials = staffCredentials();
  await dialog.getByLabel('شناسه کارکن').fill(credentials.identifier);
  await dialog.getByLabel('رمز عبور').fill(credentials.password);
  await dialog.getByRole('button', { name: 'ادامه', exact: true }).click();
  await expect(dialog.getByLabel('کد تایید شش‌رقمی')).toBeVisible();
  await waitForFreshTotpStep();
  await dialog.getByLabel('کد تایید شش‌رقمی').fill(await generate({ secret: credentials.totpSecret }));
  const freshResponse = page.waitForResponse(response => response.url().endsWith('/auth/staff/totp/verify') && response.status() === 200);
  await dialog.getByRole('button', { name: 'ورود', exact: true }).click();
  const fresh = await (await freshResponse).json() as { data: { accessToken: string; principal: { sessionId: string } } };
  await expect(dialog).toBeHidden();
  await expect(field).toHaveValue(draft);
  expect(writes).toBe(1);
  const saved = page.waitForResponse(response => response.url().endsWith('/sms-settings/templates') && response.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'ذخیرهٔ قالب‌ها' }));
  expect((await saved).status()).toBe(200);
  expect(writes).toBe(2);
  await page.reload();
  await expect(field).toHaveValue(draft);
  await field.fill(original);
  const restored = page.waitForResponse(response => response.url().endsWith('/sms-settings/templates') && response.request().method() === 'PUT');
  await tap(page.getByRole('button', { name: 'ذخیرهٔ قالب‌ها' }));
  expect((await restored).status()).toBe(200);
  // Reload rotates the session: obtain the current ID, then revoke it through
  // the normal domain command, not by editing the database.
  const apiOrigin = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';
  const cookies = await page.context().cookies(apiOrigin);
  const csrf = cookies.find(cookie => cookie.name.endsWith('csrf'))?.value;
  expect(csrf).toBeTruthy();
  const rotation = await page.context().request.post(`${apiOrigin}/api/v1/auth/refresh`, { headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf! } });
  expect(rotation.status()).toBe(200);
  const current = await rotation.json() as { data: { accessToken: string; principal: { sessionId: string } } };
  const currentCookies = await page.context().cookies(apiOrigin);
  const revoked = await page.context().request.delete(`${apiOrigin}/api/v1/auth/sessions/${current.data.principal.sessionId}`, {
    headers: { Origin: new URL(page.url()).origin, Authorization: `Bearer ${current.data.accessToken}`, 'X-CSRF-Token': currentCookies.find(cookie => cookie.name.endsWith('csrf'))!.value },
  });
  expect(revoked.status()).toBe(200);
  await tap(page.getByRole('button', { name: 'بارگذاری مجدد قالب‌ها' }));
  await expect(page).toHaveURL(/\/login$/);
  // No SMS is sent, no template is accepted by a provider, and no payment is modified.
  expect(fresh.data.principal.sessionId).not.toBe(signedIn.data.principal.sessionId);
});
