import { expect, test } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

/**
 * Integrated HTTP evidence for AUTH_CONTRACT §7/§17 and the #50 exit matrix
 * (refresh/revocation/replay). Exercises the REAL running API end-to-end through
 * the dev-only staff sign-in (the only path that mints a rotating session without
 * the not-yet-landed SMS provider). Session semantics (rotation, replay-driven
 * family revocation, logout-all, cookie-proof refresh/logout) are shared with the
 * customer OTP flow, so this is the authoritative backend evidence for the
 * storefront client's single-flight restore / no-retry latch / expired-state logic.
 */

// The refresh/logout cookie-proof requires an Origin that the API trusts
// (requireCookieProof -> AuthCsrfException otherwise). CI runs the admin server on
// 3001 and CORS_ORIGINS=http://127.0.0.1:3001.
const TRUSTED_ORIGIN = process.env.E2E_TRUSTED_ORIGIN ?? 'http://127.0.0.1:3001';

const DEV_REFRESH_COOKIE = 'iranyaragh_dev_refresh';
const DEV_CSRF_COOKIE = 'iranyaragh_dev_csrf';
const DEV_CODE = process.env.AUTH_DEV_CODE;

async function storedCookies(ctx: APIRequestContext): Promise<Record<string, string>> {
  const state = await ctx.storageState();
  return Object.fromEntries(state.cookies.map(cookie => [cookie.name, cookie.value]));
}

async function signIn(ctx: APIRequestContext) {
  const response = await ctx.post('/api/v1/auth/dev/signin', { data: { code: DEV_CODE, deviceName: 'e2e-replay' } });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as {
    data: { accessToken: string; principal: { userId: string; sessionId: string } };
  };
  const cookies = await storedCookies(ctx);
  return {
    accessToken: body.data.accessToken,
    principal: body.data.principal,
    refresh: cookies[DEV_REFRESH_COOKIE],
    csrf: cookies[DEV_CSRF_COOKIE],
  };
}

test.describe('api: real session rotation, replay and revocation (AUTH_CONTRACT §7/§17, #50)', () => {
  test.skip(!DEV_CODE, 'AUTH_DEV_CODE must be set (e2e job in .github/workflows/ci.yml)');

  test('signs in via the dev path, lists sessions, and rotates the refresh token once', async ({ request }) => {
    const session = await signIn(request);
    expect(session.accessToken.length).toBeGreaterThan(0);
    expect(session.principal.sessionId).toBeTruthy();
    expect(session.refresh).toBeTruthy();
    expect(session.csrf).toBeTruthy();

    // Cookie transport matches AUTH_CONTRACT §7: refresh is httpOnly+Strict and is
    // never exposed to script; the CSRF value must be readable by JS.
    const state = await request.storageState();
    const refreshCookie = state.cookies.find(cookie => cookie.name === DEV_REFRESH_COOKIE);
    const csrfCookie = state.cookies.find(cookie => cookie.name === DEV_CSRF_COOKIE);
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.sameSite).toBe('Strict');
    expect(refreshCookie?.secure).toBe(false);
    expect(csrfCookie?.httpOnly).toBe(false);

    // Own-session list shows the current session.
    const list = await request.get('/api/v1/auth/sessions', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as {
      data: { sessions: Array<{ current: boolean; sessionId: string }> };
    };
    expect(
      listBody.data.sessions.some(item => item.current && item.sessionId === session.principal.sessionId),
    ).toBe(true);

    // One refresh rotates and issues a fresh cookie pair.
    const rotated = await request.post('/api/v1/auth/refresh', {
      headers: { Origin: TRUSTED_ORIGIN, 'x-csrf-token': session.csrf },
    });
    expect(rotated.status()).toBe(200);
    const rotatedBody = (await rotated.json()) as {
      data: { accessToken: string; principal: { userId: string; sessionId: string } };
    };
    expect(rotatedBody.data.accessToken.length).toBeGreaterThan(0);
    expect(rotatedBody.data.accessToken).not.toBe(session.accessToken);
    // Rotation replaces the session row inside the same family: the principal
    // identity is stable but the session id and token rotate.
    expect(rotatedBody.data.principal.userId).toBe(session.principal.userId);
    expect(rotatedBody.data.principal.sessionId).toBeTruthy();
    const after = await storedCookies(request);
    expect(after[DEV_REFRESH_COOKIE]).toBeTruthy();
    expect(after[DEV_REFRESH_COOKIE]).not.toBe(session.refresh);
  });

  test('a replayed refresh revokes the whole family: REPLAYED then INVALID, so the client must never retry', async ({ request }) => {
    const session = await signIn(request);

    // Rotate once, as a normal flow; capture the legitimately rotated pair.
    const first = await request.post('/api/v1/auth/refresh', {
      headers: { Origin: TRUSTED_ORIGIN, 'x-csrf-token': session.csrf },
    });
    expect(first.status()).toBe(200);
    const afterRotation = await storedCookies(request);
    const rotatedRefresh = afterRotation[DEV_REFRESH_COOKIE];
    const rotatedCsrf = afterRotation[DEV_CSRF_COOKIE];
    expect(rotatedRefresh).toBeTruthy();
    expect(rotatedRefresh).not.toBe(session.refresh);

    // A second client replays the now-rotated pair as an explicit Cookie header:
    // the service treats this as a theft signal and revokes the whole family.
    const replay = await request.post('/api/v1/auth/refresh', {
      headers: {
        Cookie: `${DEV_REFRESH_COOKIE}=${session.refresh}; ${DEV_CSRF_COOKIE}=${session.csrf}`,
        Origin: TRUSTED_ORIGIN,
        'x-csrf-token': session.csrf,
      },
    });
    expect(replay.status()).toBe(401);
    const replayBody = (await replay.json()) as { code: string };
    expect(replayBody.code).toBe('AUTH_SESSION_REPLAYED');

    // The legitimately rotated cookie is part of the revoked family: refreshing
    // with it returns INVALID (not REPLAYED again), so the storefront latch that
    // stops any further automatic retry is exactly the correct behavior.
    const refreshAfterRevocation = await request.post('/api/v1/auth/refresh', {
      headers: {
        Cookie: `${DEV_REFRESH_COOKIE}=${rotatedRefresh}; ${DEV_CSRF_COOKIE}=${rotatedCsrf}`,
        Origin: TRUSTED_ORIGIN,
        'x-csrf-token': rotatedCsrf,
      },
    });
    expect(refreshAfterRevocation.status()).toBe(401);
    const invalidBody = (await refreshAfterRevocation.json()) as { code: string };
    expect(invalidBody.code).toBe('AUTH_SESSION_INVALID');

    // The previously issued access token points at a revoked session row.
    const me = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.status()).toBe(401);
  });

  test('logout-all revokes every session for the user and clears cookie proof', async ({ request }) => {
    const session = await signIn(request);

    const done = await request.post('/api/v1/auth/logout-all', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(done.status()).toBe(200);

    // Access token no longer resolves to a live session.
    const me = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.status()).toBe(401);

    // Cookies were cleared; a refresh without proof is rejected before any
    // rotation attempt (403 AUTH_CSRF_INVALID, distinct from an expired session).
    const refresh = await request.post('/api/v1/auth/refresh', { headers: { Origin: TRUSTED_ORIGIN } });
    expect(refresh.status()).toBe(403);
    const body = (await refresh.json()) as { code: string };
    expect(body.code).toBe('AUTH_CSRF_INVALID');
  });

  test('logout revokes only the current refresh and keeps other sessions alive', async ({ request }) => {
    const current = await signIn(request);
    const other = await signIn(request);
    expect(other.principal.sessionId).not.toBe(current.principal.sessionId);

    // Log out the FIRST sign-in by replaying its cookie pair explicitly, leaving
    // the second (current) session in the context untouched.
    const done = await request.post('/api/v1/auth/logout', {
      headers: {
        Cookie: `${DEV_REFRESH_COOKIE}=${current.refresh}; ${DEV_CSRF_COOKIE}=${current.csrf}`,
        Origin: TRUSTED_ORIGIN,
        'x-csrf-token': current.csrf,
      },
    });
    expect(done.status()).toBe(200);

    // The first session is gone.
    const revokedMe = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${current.accessToken}` },
    });
    expect(revokedMe.status()).toBe(401);

    // The other, different session survives this single-session logout.
    const aliveMe = await request.get('/api/v1/auth/me', {
      headers: { Authorization: `Bearer ${other.accessToken}` },
    });
    expect(aliveMe.status()).toBe(200);
    expect(((await aliveMe.json()) as { data: { principal: { sessionId: string } } }).data.principal.sessionId).toBe(
      other.principal.sessionId,
    );
  });
});