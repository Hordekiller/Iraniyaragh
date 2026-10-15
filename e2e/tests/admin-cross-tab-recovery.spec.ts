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

test('admin: another tab cannot revoke a recovered request before its protected replay', async ({ page, context }) => {
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
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': csrf! },
  });
  expect(rotated.status()).toBe(200);

  let releaseReplay!: () => void;
  const replayGate = new Promise<void>(resolve => { releaseReplay = resolve; });
  let replayStarted!: () => void;
  const replayReady = new Promise<void>(resolve => { replayStarted = resolve; });
  let balancesRequests = 0;
  await page.route('**/api/v1/inventory/balances?**', async route => {
    balancesRequests += 1;
    if (balancesRequests === 2) {
      replayStarted();
      await replayGate;
    }
    await route.continue();
  });

  let otherRefreshFinished = false;
  const successfulReads = new Set<string>();
  for (const [name, tab] of [['first', page], ['second', other]] as const) {
    tab.on('response', response => {
      const path = new URL(response.url()).pathname;
      if (response.status() === 200 && ['/api/v1/inventory/balances', '/api/v1/inventory/movements'].includes(path)) {
        successfulReads.add(`${name}:${path}`);
      }
    });
  }
  other.on('response', response => {
    if (response.url().endsWith('/api/v1/auth/refresh') && response.status() === 200) otherRefreshFinished = true;
  });
  try {
    const replayResponse = page.waitForResponse(response =>
      response.url().includes('/api/v1/inventory/balances?') && balancesRequests === 2);
    await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
    await replayReady;
    await other.getByRole('button', { name: 'نوسازی', exact: true }).click();
    // Before the fix the competing rotation finishes; a coordinated replay
    // must instead hold that rotation pending until the real response settles.
    await expect.poll(async () => otherRefreshFinished || other.evaluate(async () => {
      const locks = await navigator.locks.query();
      return locks.pending?.some(lock => lock.name === 'iranyaragh:auth:refresh') ?? false;
    })).toBe(true);
    releaseReplay();
    expect((await replayResponse).status()).toBe(200);
    await expect.poll(() => successfulReads.size).toBe(4);
    for (const tab of [page, other]) {
      await expect(tab.getByRole('heading', { name: 'موجودی و گردش' })).toBeVisible();
      await expect(tab).toHaveURL(/\/inventory$/);
    }
  } finally {
    releaseReplay();
    await other.close();
  }
});
