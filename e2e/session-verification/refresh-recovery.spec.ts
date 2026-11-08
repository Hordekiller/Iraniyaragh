import { expect, request as pwRequest, test, type BrowserContext, type Page } from '@playwright/test';
import { C, ORIGIN, addCustomerCookies, customerSignedIn, expireBearer, sql, staffLogin } from './helpers';

/*
 * Lost refresh responses against the real API + PostgreSQL. "Lost" means the
 * server COMMITS the rotation and the browser never receives the answer: the
 * route handler forwards the request to the real server (route.fetch), waits
 * for its response, and then aborts / drops it instead of fulfilling the page.
 */
const replays = () => Number(sql(`select count(*) from "Session" where "revokeReason"='REPLAY_DETECTED'`));
const recovered = () => Number(sql(`select count(*) from "AuditLog" where action='auth.session.refresh_recovered'`));
const familyHeads = (level: string) => Number(sql(`select count(*) from "Session" where "authenticationLevel"='${level}' and "revokedAt" is null`));
const refreshUrl = '**/api/v1/auth/refresh';

/** Make the next `n` refreshes commit on the server and lose their responses. */
async function loseRefreshResponses(page: Page, n = 1, mode: 'abort' | 'hang' = 'abort') {
  let remaining = n;
  // Counts rotations that the SERVER has really committed. `remaining` drops when a
  // refresh merely starts, so using it as "committed" let a test act (logout, a second
  // click that joins the in-flight refresh) while the first rotation was still running.
  let committed = 0;
  const attempts: string[] = [];
  // A SEPARATE request context: route.fetch() would store Set-Cookie in the
  // browser's own cookie jar and so quietly deliver the rotated cookie.
  const server = await pwRequest.newContext();
  await page.route(refreshUrl, async route => {
    if (remaining <= 0) return route.continue();
    remaining -= 1;
    attempts.push(route.request().headers()['x-refresh-attempt'] ?? '');
    const original = route.request();
    const sent = await server.fetch(original.url(), { method: 'POST', headers: await original.allHeaders(), failOnStatusCode: false });
    expect(sent.status(), 'the server committed the rotation').toBe(200);
    committed += 1;
    // ...and the browser never learns of it (no response, no Set-Cookie).
    if (mode === 'abort') return route.abort('connectionreset');
    return new Promise<void>(() => { /* never answered: page reload drops it */ });
  });
  return { attempts, committed: () => committed };
}
const rememberAttempts = (page: Page) => {
  const seen: string[] = [];
  page.on('request', r => { if (r.url().endsWith('/api/v1/auth/refresh')) seen.push(r.headers()['x-refresh-attempt'] ?? ''); });
  return seen;
};
const attemptKey = (realm: 'staff' | 'customer') => `iranyaragh:refresh-attempt:${realm}`;

test.describe.configure({ mode: 'serial' });
test.beforeEach(() => { sql(`update "Session" set "revokedAt"=now(), "revokeReason"='TEST_RESET' where "revokedAt" is null`); });

async function staffPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await staffLogin(page);
  await page.goto('/admin/inventory');
  await expect(page.getByRole('button', { name: 'نوسازی', exact: true })).toBeVisible();
  return page;
}

test('1,3,4,12 response lost after commit (network drop): same attempt recovers, one family branch, no replay', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await staffPage(context);
  const before = { replays: replays(), recovered: recovered() };
  const lost = await loseRefreshResponses(page, 1, 'abort');
  const seen = rememberAttempts(page);
  await expireBearer(page, '/api/v1/inventory/balances', 1);
  await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);
  // The user keeps their page/state after the temporary failure.
  await expect(page).toHaveURL(/\/admin\/inventory/);
  // Retry (the refresh button again): same attempt id, server returns the committed outcome.
  await expireBearer(page, '/api/v1/inventory/balances', 1);
  await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => recovered()).toBe(before.recovered + 1);
  expect(new Set(seen).size, 'retry reused the pending attempt id').toBe(1);
  expect(replays()).toBe(before.replays);
  expect(familyHeads('STAFF_MFA')).toBe(1);
  expect(sql(`select count(distinct "tokenFamilyId") from "Session" where "authenticationLevel"='STAFF_MFA' and "revokedAt" is null`)).toBe('1');
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  await context.close();
});

test('2 reload before the response arrives: the restore after reload recovers the committed rotation', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await staffPage(context);
  const before = { replays: replays(), recovered: recovered() };
  const lost = await loseRefreshResponses(page, 1, 'hang');
  await expireBearer(page, '/api/v1/inventory/balances', 1);
  await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);
  await page.reload();                                      // response never delivered; cookie still old
  await expect(page.getByRole('button', { name: 'نوسازی', exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
  expect(recovered()).toBe(before.recovered + 1);
  expect(replays()).toBe(before.replays);
  expect(familyHeads('STAFF_MFA')).toBe(1);
  await context.close();
});

test('5 retry after the recovery window is replay: family revoked, user must sign in again', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await staffPage(context);
  const before = replays();
  const lost = await loseRefreshResponses(page, 1, 'abort');
  await expireBearer(page, '/api/v1/inventory/balances', 1);
  await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);
  await page.waitForTimeout(16_000);                         // > 15 s server window
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(replays()).toBe(before + 1);
  expect(familyHeads('STAFF_MFA')).toBe(0);
  expect(await page.evaluate(k => localStorage.getItem(k), attemptKey('staff')), 'terminal failure clears the pending attempt').toBeNull();
  await context.close();
});

test('6,11 a different attempt id (or none) with a stolen old token gets no successor and burns the family', async ({ browser, playwright }) => {
  const context = await browser.newContext();
  const page = await staffPage(context);
  const stolen = (await context.cookies()).filter(c => c.name === C.sRefresh || c.name === C.sCsrf);
  const cookie = stolen.map(c => `${c.name}=${c.value}`).join('; ');
  const csrf = stolen.find(c => c.name === C.sCsrf)!.value;
  const lost = await loseRefreshResponses(page, 1, 'abort');
  await expireBearer(page, '/api/v1/inventory/balances', 1);
  await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);

  const attacker = await playwright.request.newContext({ baseURL: ORIGIN });
  const before = replays();
  const reply = await attacker.post('/api/v1/auth/refresh', {
    headers: { Cookie: cookie, Origin: ORIGIN, 'X-CSRF-Token': csrf, 'X-Auth-Realm': 'staff', 'X-Refresh-Attempt': 'attackerGuessedAttemptId0' },
  });
  expect(reply.status()).toBe(401);
  expect((await reply.json()).code).toBe('AUTH_SESSION_REPLAYED');
  expect(reply.headers()['set-cookie'] ?? '', 'no cookies issued').not.toMatch(/iranyaragh_staff_refresh=[^;]+/);
  expect(replays()).toBe(before + 1);
  expect(familyHeads('STAFF_MFA')).toBe(0);
  await attacker.dispose();
  await context.close();
});

test('7 several tabs retrying the same lost attempt converge on one outcome', async ({ browser }) => {
  const context = await browser.newContext();
  const first = await staffPage(context);
  const tabs = [first];
  for (let i = 0; i < 2; i += 1) { const p = await context.newPage(); await p.goto('/admin/inventory'); tabs.push(p); }
  const before = { replays: replays(), recovered: recovered() };
  const lost = await loseRefreshResponses(first, 1, 'abort');
  await expireBearer(first, '/api/v1/inventory/balances', 1);
  await first.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);
  for (const tab of tabs) await expireBearer(tab, '/api/v1/inventory/balances', 1);
  await Promise.all(tabs.map(tab => tab.getByRole('button', { name: 'نوسازی', exact: true }).click()));
  await expect.poll(() => recovered()).toBeGreaterThan(before.recovered);
  for (const tab of tabs) { await tab.reload(); await expect(tab).not.toHaveURL(/\/login/); }
  expect(replays()).toBe(before.replays);
  expect(familyHeads('STAFF_MFA')).toBe(1);
  await context.close();
});

test('8 customer and admin lose and recover their refresh independently', async ({ browser }) => {
  const context = await browser.newContext();
  await addCustomerCookies(context);
  const shop = await context.newPage();
  await shop.goto('/');
  await customerSignedIn(shop);
  const admin = await staffPage(context);
  const before = { replays: replays(), recovered: recovered() };

  // Customer: bearer expires on the account page, its refresh commits and the response is lost.
  const shopLost = await loseRefreshResponses(shop, 1, 'abort');
  await expireBearer(shop, '/api/v1/customers/me', 1);
  await shop.goto('/account/addresses');
  await expect.poll(() => shopLost.committed()).toBe(1);
  // Admin: the same failure at the same time, in its own realm.
  const adminLost = await loseRefreshResponses(admin, 1, 'abort');
  await expireBearer(admin, '/api/v1/inventory/balances', 1);
  await admin.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => adminLost.committed()).toBe(1);
  expect(await shop.evaluate(() => Object.keys(localStorage).filter(k => k.includes('refresh-attempt')))).toEqual(
    expect.arrayContaining(['iranyaragh:refresh-attempt:customer', 'iranyaragh:refresh-attempt:staff']));

  // Each realm retries with its own pending attempt and recovers its own rotation.
  await shop.reload();
  await customerSignedIn(shop);
  await expireBearer(admin, '/api/v1/inventory/balances', 1);
  await admin.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => recovered()).toBe(before.recovered + 2);
  expect(replays()).toBe(before.replays);
  expect(familyHeads('STAFF_MFA')).toBe(1);
  expect(familyHeads('CUSTOMER_OTP')).toBe(1);
  await context.close();
});

test('9,10 logout, revocation or credential-change during the window makes recovery impossible', async ({ browser }) => {
  for (const how of ['logout', 'revoke'] as const) {
    sql(`update "Session" set "revokedAt"=now(), "revokeReason"='TEST_RESET' where "revokedAt" is null`);
    const context = await browser.newContext();
    const page = await staffPage(context);
    const old = (await context.cookies()).filter(c => c.name === C.sRefresh || c.name === C.sCsrf);
    const lost = await loseRefreshResponses(page, 1, 'abort');
    await expireBearer(page, '/api/v1/inventory/balances', 1);
    await page.getByRole('button', { name: 'نوسازی', exact: true }).click();
    await expect.poll(() => lost.committed()).toBe(1);
    if (how === 'logout') {
      const res = await context.request.post('/api/v1/auth/logout', { headers: { Origin: ORIGIN, 'X-Auth-Realm': 'staff', 'X-CSRF-Token': old.find(c => c.name === C.sCsrf)!.value } });
      expect(res.status()).toBe(200);
    } else {
      sql(`update "Session" set "revokedAt"=now(), "revokeReason"='LOGOUT_ALL' where "authenticationLevel"='STAFF_MFA' and "revokedAt" is null`);
    }
    const recoveredBefore = recovered();
    await page.reload();
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(recovered(), how).toBe(recoveredBefore);
    expect(familyHeads('STAFF_MFA'), how).toBe(0);
    await context.close();
  }
});

test('13 no refresh token or CSRF value ever reaches storage, URLs or the attempt header', async ({ browser }) => {
  const context = await browser.newContext();
  await addCustomerCookies(context);
  const shop = await context.newPage();
  await shop.goto('/');
  await customerSignedIn(shop);
  const admin = await staffPage(context);
  const headers: string[] = [];
  const urls: string[] = [];
  for (const p of [shop, admin]) p.on('request', r => { urls.push(r.url()); headers.push(r.headers()['x-refresh-attempt'] ?? ''); });
  const lost = await loseRefreshResponses(admin, 1, 'abort');
  await expireBearer(admin, '/api/v1/inventory/balances', 1);
  await admin.getByRole('button', { name: 'نوسازی', exact: true }).click();
  await expect.poll(() => lost.committed()).toBe(1);

  const secrets = (await context.cookies()).map(c => c.value).filter(v => v.length >= 20);
  expect(secrets.length).toBeGreaterThan(0);
  for (const p of [shop, admin]) {
    const dump = await p.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    for (const secret of secrets) expect(dump).not.toContain(secret);
  }
  for (const secret of secrets) { expect(headers.join('|')).not.toContain(secret); expect(urls.join('|')).not.toContain(secret); }
  await context.close();
});
