import { expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';
import { generate } from 'otplib';
import { waitForFreshTotpStep } from './totp-step';

/**
 * Real staff sign-in for API-level specs.
 *
 * Mirrors the operator contract exactly: `POST /auth/staff/password` returns a
 * short-lived challenge, and `POST /auth/staff/totp/verify` exchanges that
 * challenge plus a current TOTP code for the access token and the session
 * cookies. There is no development access code in the product, so a spec that
 * needs an authenticated API context must walk the real two-step flow.
 */

/**
 * Session cookie names, mirroring the API's environment-scoped spec in
 * `apps/api/src/modules/auth/auth.config.ts`, which is the single source of
 * truth: `__Host-` prefixed and secure in staging/production, plain names in
 * development and test. E2E runs against the test environment, so the non-secure
 * pair is what the API actually sets.
 */
const SECURE_COOKIE_ENVIRONMENTS = new Set(['staging', 'production']);
const secureCookies = SECURE_COOKIE_ENVIRONMENTS.has(process.env.NODE_ENV ?? '');
export const STAFF_REFRESH_COOKIE = secureCookies ? '__Host-iranyaragh_refresh' : 'iranyaragh_customer_refresh';
export const STAFF_CSRF_COOKIE = secureCookies ? '__Host-iranyaragh_csrf' : 'iranyaragh_customer_csrf';

export function staffCredentials() {
  const identifier = process.env.E2E_STAFF_EMAIL;
  const password = process.env.E2E_STAFF_PASSWORD;
  const totpSecret = process.env.E2E_STAFF_TOTP_SECRET;
  if (!identifier || !password || !totpSecret) {
    throw new Error(
      'E2E_STAFF_EMAIL, E2E_STAFF_PASSWORD and E2E_STAFF_TOTP_SECRET must be set for the real staff sign-in. ' +
        'Provision the identity with `pnpm --filter @iranyaragh/api auth:e2e-staff`.',
    );
  }
  return { identifier, password, totpSecret };
}

export function staffSignInAvailable(): boolean {
  return Boolean(process.env.E2E_STAFF_EMAIL && process.env.E2E_STAFF_PASSWORD && process.env.E2E_STAFF_TOTP_SECRET);
}

export async function storedCookies(ctx: APIRequestContext): Promise<Record<string, string>> {
  const state = await ctx.storageState();
  return Object.fromEntries(state.cookies.map(cookie => [cookie.name, cookie.value]));
}

export async function signInStaff(ctx: APIRequestContext) {
  const { identifier, password, totpSecret } = staffCredentials();

  const challenge = await ctx.post('/api/v1/auth/staff/password', { data: { identifier, password } });
  expect(challenge.status(), 'the staff password step must be accepted').toBe(200);
  const challengeBody = (await challenge.json()) as { data: { challengeToken: string; next: string } };
  expect(challengeBody.data.next).toBe('TOTP');

  const verified = await ctx.post('/api/v1/auth/staff/totp/verify', {
    data: { challengeToken: challengeBody.data.challengeToken, code: await freshCode(totpSecret) },
  });
  expect(verified.status(), 'the TOTP step must be accepted').toBe(200);
  const body = (await verified.json()) as {
    data: { accessToken: string; principal: { userId: string; sessionId: string; authenticationLevel: string } };
  };

  const cookies = await storedCookies(ctx);
  return {
    accessToken: body.data.accessToken,
    principal: body.data.principal,
    refresh: cookies[STAFF_REFRESH_COOKIE],
    csrf: cookies[STAFF_CSRF_COOKIE],
  };
}

async function freshCode(totpSecret: string): Promise<string> {
  await waitForFreshTotpStep();
  return generate({ secret: totpSecret });
}
