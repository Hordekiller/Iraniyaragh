import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signInDiAsAdmin } from './helpers';

async function openInventory(page: Page) {
  const [balances, movements] = await Promise.all([
    page.waitForResponse(response => response.status() === 200 && response.url().includes('/api/v1/inventory/balances?')),
    page.waitForResponse(response => response.status() === 200 && response.url().includes('/api/v1/inventory/movements?')),
    page.goto('/inventory'),
  ]);
  await Promise.all([balances.finished(), movements.finished()]);
  await expect(page.getByRole('heading', { name: 'موجودی و گردش' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'نوسازی', exact: true })).toBeVisible();
}

test('admin: a cookie rotation does not sign out stale tabs', async ({ page, context }) => {
  await signInDiAsAdmin(page);
  await openInventory(page);
  const other = await context.newPage();
  await openInventory(other);

  // A genuine cookie rotation makes both tabs' memory-only bearers stale.
  // No database edits, fixture auth, fabricated response or token disclosure.
  const apiOrigin = process.env.API_E2E_URL ?? 'http://127.0.0.1:4000';
  const csrf = (await context.cookies(apiOrigin)).find(cookie => cookie.name.endsWith('csrf'))?.value;
  expect(csrf).toBeTruthy();
  const rotated = await context.request.post(`${apiOrigin}/api/v1/auth/refresh`, {
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf!, 'X-Auth-Realm': 'staff' },
  });
  expect(rotated.status()).toBe(200);

  // A rotation retires the row both bearers were signed for, but the login is
  // still live: neither stale tab may be signed out, and each must keep
  // reading through the real API (no fabricated response, no database edit).
  const successfulReads = new Set<string>();
  for (const [name, tab] of [['first', page], ['second', other]] as const) {
    tab.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (response.status() === 200 && ['/api/v1/inventory/balances', '/api/v1/inventory/movements'].includes(path)) {
        successfulReads.add(`${name}:${path}`);
      }
    });
  }
  try {
    await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
    await other.getByRole('button', { name: 'نوسازی', exact: true }).click();
    await expect.poll(() => successfulReads.size).toBe(4);
    for (const tab of [page, other]) {
      await expect(tab.getByRole('heading', { name: 'موجودی و گردش' })).toBeVisible();
      await expect(tab).toHaveURL(/\/inventory$/);
    }
  } finally {
    await other.close();
  }
});
