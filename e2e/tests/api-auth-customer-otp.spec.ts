import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Real-HTTP evidence for the storefront's customer-OTP wiring (AUTH_CONTRACT §6/§9).
 *
 * Exercises the live request/verify error + rate-limit surface that the shipped
 * `AuthHttpClient` (apps/web/src/lib/auth/api.ts) relies on. The happy-path
 * verify (correct code -> access token + refresh/CSRF cookies) is intentionally
 * not covered here: the code is random, persisted only as a hash, never logged
 * and has no dev-gated reveal, so an E2E cannot legitimately learn it without a
 * real SMS provider bound to a test phone. Wrong-code, max-attempts, validation
 * and resend/request-window behaviour is exactly what the storefront must map to
 * the same codes the fixture client models.
 *
 * NOTE: request/verify are public challenge endpoints — no cookies, CSRF or
 * Origin are required (CSRF applies only to refresh/logout; AUTH_CONTRACT §4.2).
 */

/**
 * The `otp-request:destination` window (AUTH_CONTRACT §9) allows 1 request per
 * 60s. Each scenario uses a unique mobile so runs stay isolated from earlier
 * ones, except where the spec deliberately asserts the 429 window.
 */
function freshMobile(): string {
  const digits = String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0');
  return `+989${digits}`;
}

async function requestOtp(api: APIRequestContext, mobile: string) {
  return api.post('/api/v1/auth/customer/otp/request', {
    data: { mobile, client: 'CUSTOMER_WEB' },
  });
}

test.describe('api: customer OTP request/verify wiring (AUTH_CONTRACT §6/§9, #50)', () => {
  test('accepts a request for a fresh mobile with the storefront envelope', async ({ request }) => {
    const response = await requestOtp(request, freshMobile());

    expect(response.status()).toBe(202);
    expect(response.headers()['cache-control']).toContain('no-store');

    const body = (await response.json()) as {
      data: { challengeId: string; expiresInSeconds: number; resendAfterSeconds: number };
    };
    expect(body.data.challengeId).toEqual(expect.any(String));
    expect(body.data.expiresInSeconds).toBe(300);
    expect(body.data.resendAfterSeconds).toBe(60);
  });

  test('rate-limits a second request for the same destination within 60s', async ({ request }) => {
    const mobile = freshMobile();
    const first = await requestOtp(request, mobile);
    expect(first.status()).toBe(202);

    const second = await requestOtp(request, mobile);
    expect(second.status()).toBe(429);

    const body = (await second.json()) as { code: string; statusCode: number };
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.statusCode).toBe(429);

    const retryAfter = Number(second.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  test('rejects an unsupported mobile format before any challenge is issued', async ({ request }) => {
    const response = await requestOtp(request, '123');
    expect(response.status()).toBe(400);

    const body = (await response.json()) as { code: string; statusCode: number };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.statusCode).toBe(400);
  });

  test('treats wrong and exhausted codes uniformly as an invalid challenge', async ({ request }) => {
    const issued = await requestOtp(request, freshMobile());
    expect(issued.status()).toBe(202);
    const { data } = (await issued.json()) as {
      data: { challengeId: string; expiresInSeconds: number; resendAfterSeconds: number };
    };

    // maxAttempts is 5; every wrong code must surface the same invalid-challenge
    // code the storefront maps to 「کد واردشده صحیح نیست.」 — never a storefront crash.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const verification = await request.post('/api/v1/auth/customer/otp/verify', {
        data: { challengeId: data.challengeId, code: '000000', deviceName: 'e2e' },
      });
      expect(verification.status()).toBe(401);
      const body = (await verification.json()) as { code: string; statusCode: number };
      expect(body.code).toBe('AUTH_CHALLENGE_INVALID');
      expect(body.statusCode).toBe(401);
    }

    // The challenge is now exhausted (maxAttempts consumed): same uniform code.
    const exhausted = await request.post('/api/v1/auth/customer/otp/verify', {
      data: { challengeId: data.challengeId, code: '123456' },
    });
    expect(exhausted.status()).toBe(401);
    const body = (await exhausted.json()) as { code: string };
    expect(body.code).toBe('AUTH_CHALLENGE_INVALID');
  });

  test('rejects unknown challenges and malformed payloads deterministically', async ({ request }) => {
    const unknown = await request.post('/api/v1/auth/customer/otp/verify', {
      data: { challengeId: 'does-not-exist', code: '123456' },
    });
    expect(unknown.status()).toBe(401);
    expect(((await unknown.json()) as { code: string }).code).toBe('AUTH_CHALLENGE_INVALID');

    const malformedCode = await request.post('/api/v1/auth/customer/otp/verify', {
      data: { challengeId: 'does-not-exist', code: '12' },
    });
    // DTO-level rejections carry the generic 400 code (INVALID_REQUEST);
    // service-level rejections (see the invalid-mobile test) carry VALIDATION_ERROR.
    // The storefront never triggers either from this payload shape: it validates
    // the 6-digit format and the mobile format before calling the API.
    expect(malformedCode.status()).toBe(400);
    expect(((await malformedCode.json()) as { code: string }).code).toBe('INVALID_REQUEST');

    const wrongClient = await request.post('/api/v1/auth/customer/otp/request', {
      data: { mobile: freshMobile(), client: 'ADMIN_WEB' },
    });
    expect(wrongClient.status()).toBe(400);
    expect(((await wrongClient.json()) as { code: string }).code).toBe('INVALID_REQUEST');
  });
});