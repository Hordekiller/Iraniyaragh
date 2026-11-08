import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { generate } from 'otplib';
import { waitForFreshTotpStep } from '../tests/totp-step';

/*
 * Session reliability on ONE origin (nginx -> storefront / admin(/admin) / API).
 * Time is controlled two ways, both against the real server rules:
 *  - server clock: `lastUsedAt` of the live session row is back-dated in the
 *    disposable test DB (server inactivity is measured from that column);
 *  - browser clock: Playwright's page.clock fast-forwards keep-alive timers.
 * Access-token expiry uses a token signed with the real test secret and an
 * `exp` in the past, so the server's own verification rejects it.
 * Customer identity is minted through the real AuthSessionService because the
 * customer OTP is random/hash-only (see mint-session.cjs).
 */
export const ORIGIN = process.env.SESSION_E2E_ORIGIN ?? 'http://127.0.0.1:8180';
export const PG = process.env.SESSION_E2E_PG_CONTAINER ?? 'sessionfix-pg';
export const STAFF = { id: process.env.E2E_STAFF_EMAIL!, password: process.env.E2E_STAFF_PASSWORD!, totp: process.env.E2E_STAFF_TOTP_SECRET! };
export const JWT_SECRET = process.env.JWT_ACCESS_SECRET!;
// SESSION_E2E_PRODUCTION_COOKIES=1 targets a NODE_ENV=staging|production API behind HTTPS:
// the real __Host- names (Secure, Path=/, no Domain) instead of the development names.
export const PRODUCTION_COOKIES = process.env.SESSION_E2E_PRODUCTION_COOKIES === '1';
export const C = PRODUCTION_COOKIES
  ? { cRefresh: '__Host-iranyaragh_refresh', cCsrf: '__Host-iranyaragh_csrf', sRefresh: '__Host-iranyaragh_staff_refresh', sCsrf: '__Host-iranyaragh_staff_csrf' }
  : { cRefresh: 'iranyaragh_customer_refresh', cCsrf: 'iranyaragh_customer_csrf', sRefresh: 'iranyaragh_staff_refresh', sCsrf: 'iranyaragh_staff_csrf' };

export function sql(statement: string): string {
  return execFileSync('docker', ['exec', PG, 'psql', '-U', 'app_test', '-d', 'sf_test', '-At', '-c', statement], { encoding: 'utf8' }).trim();
}
export const backdate = (level: 'STAFF_MFA' | 'CUSTOMER_OTP', minutes: number) =>
  // createdAt/authenticatedAt move too: the table enforces authenticatedAt <= createdAt <= lastUsedAt.
  sql(`update "Session" set "authenticatedAt" = now() - interval '${minutes + 2} minutes', "createdAt" = now() - interval '${minutes + 1} minutes', "lastUsedAt" = now() - interval '${minutes} minutes' where "authenticationLevel"='${level}' and "revokedAt" is null`);
export const lastUsedAgeSeconds = (level: string) =>
  Number(sql(`select extract(epoch from (now() - max("lastUsedAt"))) from "Session" where "authenticationLevel"='${level}' and "revokedAt" is null`));
export const liveSessions = (level: string) => Number(sql(`select count(*) from "Session" where "authenticationLevel"='${level}' and "revokedAt" is null`));

export function mintCustomer(): { refreshToken: string; csrfToken: string } {
  const out = execFileSync('node', [path.join(__dirname, 'mint-session.cjs'), 'customer', 'e2e_customer'], { encoding: 'utf8', env: process.env });
  return JSON.parse(out.trim().split('\n').pop()!);
}
export async function addCustomerCookies(context: BrowserContext) {
  const { refreshToken, csrfToken } = mintCustomer();
  // `url` (not domain/path) is what lets a __Host- cookie be set: it must carry no Domain attribute.
  await context.addCookies([
    { name: C.cRefresh, value: refreshToken, url: ORIGIN, httpOnly: true, secure: PRODUCTION_COOKIES, sameSite: 'Strict' },
    { name: C.cCsrf, value: csrfToken, url: ORIGIN, httpOnly: false, secure: PRODUCTION_COOKIES, sameSite: 'Strict' },
  ]);
}
export async function staffLogin(page: Page) {
  await page.goto('/admin/login');
  await page.getByLabel('شناسه کارکن').fill(STAFF.id);
  await page.getByLabel('رمز عبور').fill(STAFF.password);
  await page.getByRole('button', { name: 'ادامه' }).click();
  const code = page.getByLabel('کد تایید شش‌رقمی');
  await expect(code).toBeVisible();
  await waitForFreshTotpStep();
  await code.fill(await generate({ secret: STAFF.totp }));
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
}
export const cookieNames = async (context: BrowserContext) => (await context.cookies()).map(c => c.name);
export const customerSignedIn = (page: Page) => expect(page.getByRole('button', { name: 'حساب کاربری' }).first()).toBeVisible({ timeout: 20_000 });

/** A genuinely signed but already-expired access token (claims copied from a live one). */
export function expiredTokenFrom(token: string): string {
  const [h, p] = token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString());
  claims.iat = Math.floor(Date.now() / 1000) - 7200;
  claims.exp = Math.floor(Date.now() / 1000) - 3600;
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${h}.${body}`).digest('base64url');
  return `${h}.${body}.${sig}`;
}
/** Make the next N protected API calls from the page carry an expired token. */
export async function expireBearer(page: Page, urlPart: string, times = 1) {
  let remaining = times;
  const seen: number[] = [];
  await page.route(`**${urlPart}**`, async route => {
    const headers = route.request().headers();
    if (remaining > 0 && headers.authorization?.startsWith('Bearer ')) {
      remaining -= 1;
      const response = await route.fetch({ headers: { ...headers, authorization: `Bearer ${expiredTokenFrom(headers.authorization.slice(7))}` } });
      seen.push(response.status());
      return route.fulfill({ response });
    }
    return route.continue();
  });
  return { seen };
}

