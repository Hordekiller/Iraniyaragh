import { expect, test, type Page } from '@playwright/test';
import { ORIGIN, C, sql, backdate, lastUsedAgeSeconds, liveSessions, addCustomerCookies, staffLogin, cookieNames, customerSignedIn, expireBearer } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async () => {
  sql(`update "Session" set "revokedAt"=now(), "revokeReason"='TEST_RESET' where "revokedAt" is null`);
});

test('1-3,10 customer and admin coexist on one origin; logins and logouts stay inside their realm', async ({ browser }) => {
  const context = await browser.newContext();
  await addCustomerCookies(context);
  const shop = await context.newPage();
  await shop.goto('/');
  await customerSignedIn(shop);

  const admin = await context.newPage();
  await staffLogin(admin);
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([C.cRefresh, C.cCsrf, C.sRefresh, C.sCsrf]));

  // Admin login did not invalidate the customer: a reload restores it.
  await shop.reload();
  await customerSignedIn(shop);
  // Customer reload / refresh did not invalidate the admin either.
  await admin.reload();
  await expect(admin).toHaveURL(/\/admin\/dashboard$/);
  expect(liveSessions('STAFF_MFA')).toBe(1);
  expect(liveSessions('CUSTOMER_OTP')).toBeGreaterThanOrEqual(1);

  // Customer logout leaves staff intact.
  await shop.getByRole('button', { name: 'حساب کاربری' }).first().click();
  await shop.getByRole('menuitem', { name: /خروج/ }).click();
  await expect.poll(() => liveSessions('CUSTOMER_OTP')).toBe(0);
  expect(await cookieNames(context)).toEqual(expect.arrayContaining([C.sRefresh, C.sCsrf]));
  await admin.reload();
  await expect(admin).toHaveURL(/\/admin\/dashboard$/);
  await context.close();
});

test('4,5,6 concurrent multi-tab refresh, reload and expired access token keep the staff session', async ({ browser }) => {
  const replaysBefore = sql(`select count(*) from "Session" where "revokeReason"='REPLAY_DETECTED'`);
  const context = await browser.newContext();
  const first = await context.newPage();
  await staffLogin(first);
  const tabs = [first];
  for (let i = 0; i < 3; i += 1) { const p = await context.newPage(); await p.goto('/admin/inventory'); tabs.push(p); }
  await first.goto('/admin/inventory');
  const refreshes: number[] = [];
  const unauthorised: number[] = [];
  for (const tab of tabs) {
    tab.on('response', r => {
      if (r.url().endsWith('/api/v1/auth/refresh')) refreshes.push(r.status());
      if (r.url().includes('/api/v1/inventory/') && r.status() === 401) unauthorised.push(401);
    });
  }
  const refresh = (tab: Page) => tab.getByRole('button', { name: 'نوسازی', exact: true });
  for (const tab of tabs) await expect(refresh(tab)).toBeVisible();

  // Every tab's bearer is now expired; all four fire protected reads at once.
  for (const tab of tabs) await expireBearer(tab, '/api/v1/inventory/balances', 1);
  await Promise.all(tabs.map(tab => refresh(tab).click()));
  await expect.poll(() => refreshes.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => unauthorised.length).toBeGreaterThanOrEqual(1);   // the server really rejected the expired token
  for (const tab of tabs) { await expect(tab).toHaveURL(/\/admin\/inventory/); await expect(refresh(tab)).toBeVisible(); }

  // Reload each tab (settled): the session restores from the rotated cookie.
  for (const tab of tabs) { await tab.reload(); await expect(refresh(tab)).toBeVisible(); await expect(tab).not.toHaveURL(/\/login/); }
  expect(refreshes.every(status => status === 200), `refresh statuses ${refreshes}`).toBe(true);
  expect(sql(`select count(*) from "Session" where "revokeReason"='REPLAY_DETECTED'`), 'no family was revoked as a replay').toBe(replaysBefore);
  expect(liveSessions('STAFF_MFA'), 'rotation keeps exactly one live staff session').toBe(1);
  await context.close();
});

test('6b expired access token on a live customer page is recovered silently and replayed', async ({ browser }) => {
  const context = await browser.newContext();
  await addCustomerCookies(context);
  const page = await context.newPage();
  const guard = await expireBearer(page, '/api/v1/customers/me');
  const statuses: number[] = [];
  page.on('response', r => { if (r.url().includes('/api/v1/customers/me')) statuses.push(r.status()); });
  await page.goto('/account/addresses');
  await expect.poll(() => statuses.length).toBeGreaterThan(1);
  expect(guard.seen[0]).toBe(401);                      // the server really rejected the expired token
  expect(statuses.at(-1)).not.toBe(401);                // ...and the replay with the rotated session was accepted
  await expect(page.getByText(/نشست.*معتبر نیست|Session is invalid/)).toHaveCount(0);
  await context.close();
});

test('7,8,12 active staff editing for >30 min stays signed in; an idle one expires', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.clock.install({ time: new Date() });
  if (process.env.SESSION_E2E_DEBUG) {
    const t0 = Date.now();
    page.on('request', r => { if (r.url().includes('/api/v1/auth/')) console.log(`${Date.now() - t0} REQ ${r.method()} ${r.url().split('/v1')[1]}`); });
    page.on('requestfailed', r => { if (r.url().includes('/api/v1/auth/')) console.log(`${Date.now() - t0} FAIL ${r.url().split('/v1')[1]}`); });
    page.on('response', r => { if (r.url().includes('/api/v1/auth/')) console.log(`${Date.now() - t0} RES ${r.status()} ${r.url().split('/v1')[1]}`); });
    page.on('framenavigated', f => { if (f === page.mainFrame()) console.log(`${Date.now() - t0} NAV ${f.url()}`); });
  }
  await staffLogin(page);
  await page.goto('/admin/catalog/products/new');
  const name = page.getByLabel('نام کالا', { exact: false });
  await expect(name).toBeVisible();

  // 29 simulated minutes without any API call, then genuine typing in a long form.
  backdate('STAFF_MFA', 29);
  await name.pressSequentially('ویرایش طولانی محصول ', { delay: 10 });
  // Advance page time one minute at a time and let the network settle between
  // steps: a single 6-minute jump would also fire the client's own 15 s request
  // timeouts and abort requests mid-flight, which is a clock artefact.
  for (let minute = 0; minute < 7; minute += 1) { await page.clock.runFor(60_000); await page.waitForTimeout(250); }
  await expect.poll(() => lastUsedAgeSeconds('STAFF_MFA'), { message: 'keep-alive refreshed the server inactivity clock' }).toBeLessThan(30);

  // Another 29 simulated minutes later the session is still valid for a real call.
  // (Back-dating moves authenticatedAt too, so the old bearer is rejected and the
  // client recovers through refresh - the page must stay on the form.)
  backdate('STAFF_MFA', 29);
  const meAfterReload = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/me'));
  await page.reload();
  expect((await meAfterReload).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/catalog\/products\/new$/);
  await expect(name).toBeVisible();

  // No typing, no pointer: an idle tab sends no activity signal at all.
  let idlePings = 0;
  page.on('request', r => { if (r.url().endsWith('/api/v1/auth/activity')) idlePings += 1; });
  for (let minute = 0; minute < 40; minute += 1) { await page.clock.runFor(60_000); await page.waitForTimeout(30); }
  expect(idlePings, 'idle tab must not ping').toBe(0);

  // ...so the server expires it at the 30-minute policy (31 idle minutes).
  backdate('STAFF_MFA', 31);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login/);
  expect(liveSessions('STAFF_MFA')).toBe(0);
  await context.close();
});

test('9 temporary network failure and 403 do not end the staff session; and are not mistaken for a revoked session', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await staffLogin(page);
  // Network drop on the next protected read.
  let dropped = 0;
  await page.route('**/api/v1/auth/sessions**', route => (dropped++ < 2 ? route.abort('connectionfailed') : route.continue()));
  await page.goto('/admin/settings/sessions');
  await expect(page).not.toHaveURL(/\/login/);
  expect(liveSessions('STAFF_MFA')).toBe(1);
  // 403 from a protected route.
  await page.route('**/api/v1/auth/sessions**', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'FORBIDDEN', message: 'no', requestId: 'x', statusCode: 403 }) }));
  await page.reload();
  await expect(page).not.toHaveURL(/\/login/);
  expect(liveSessions('STAFF_MFA')).toBe(1);
  await context.close();
});

test('11 a revoked session cannot refresh, reload or be revived by activity', async ({ browser }) => {
  const context = await browser.newContext();
  await addCustomerCookies(context);
  const shop = await context.newPage();
  await shop.goto('/');
  await customerSignedIn(shop);
  const admin = await context.newPage();
  await staffLogin(admin);
  const staffCookies = (await context.cookies()).filter(c => c.name === C.sRefresh || c.name === C.sCsrf);

  sql(`update "Session" set "revokedAt"=now(), "revokeReason"='LOGOUT' where "authenticationLevel"='STAFF_MFA' and "revokedAt" is null`);
  const refresh = await context.request.post('/api/v1/auth/refresh', { headers: { 'X-Auth-Realm': 'staff', Origin: ORIGIN, 'X-CSRF-Token': staffCookies.find(c => c.name === C.sCsrf)!.value } });
  expect(refresh.status()).toBe(401);
  await admin.reload();
  await expect(admin).toHaveURL(/\/admin\/login/);
  expect(liveSessions('STAFF_MFA')).toBe(0);
  // Customer realm unaffected by the staff revocation.
  await shop.reload();
  await customerSignedIn(shop);
  await context.close();
});
