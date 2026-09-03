import { describe, expect, it } from 'vitest';
import { AuthFixtureClient } from './fixtures';
import { MemorySessionStore } from './session-store';
import type { AuthFixtureOptions } from './fixtures';

function makeClient(options: AuthFixtureOptions = {}) {
  let now = options.now ?? (() => Date.now());
  const store = new MemorySessionStore();
  const client = new AuthFixtureClient({ store, ...options, now: () => now() });
  return { client, store, setNow: (t: number) => (now = () => t) };
}

const MOBILE = '+989123456789';

describe('AuthFixtureClient OTP state machine', () => {
  it('issues a challenge and verifies with a six-digit code', async () => {
    const { client, store, setNow } = makeClient();
    setNow(1_000);

    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    expect(challenge.expiresInSeconds).toBe(300);
    expect(challenge.resendAfterSeconds).toBe(60);
    expect(challenge.challengeId).toMatch(/^fixture-challenge-/);

    const access = await client.verifyOtp({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    expect(access.principal.authenticationLevel).toBe('CUSTOMER_OTP');
    expect(access.principal.permissions).toEqual([]);
    expect(store.isAuthenticated()).toBe(true);
  });

  it('is single use: verifying again with the same challenge fails', async () => {
    const { client, setNow } = makeClient();
    setNow(1_000);
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    await client.verifyOtp({ challengeId: challenge.challengeId, code: '123456' });
    await expect(
      client.verifyOtp({ challengeId: challenge.challengeId, code: '654321' }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  });

  it('rejects an unknown challenge', async () => {
    const { client } = makeClient();
    await expect(
      client.verifyOtp({ challengeId: 'nope', code: '123456' }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
  });

  it('rejects a malformed (non-6-digit) code as VALIDATION_ERROR', async () => {
    const { client } = makeClient();
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    await expect(
      client.verifyOtp({ challengeId: challenge.challengeId, code: '12' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns AUTH_CHALLENGE_EXPIRED after the 300s window', async () => {
    const { client, setNow } = makeClient();
    setNow(1_000);
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    setNow(400_000); // > 300s later
    await expect(
      client.verifyOtp({ challengeId: challenge.challengeId, code: '123456' }),
    ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_EXPIRED' });
  });

  it('rate-limits after five invalid attempts and invalidates the challenge', async () => {
    const { client } = makeClient();
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    for (let i = 0; i < 4; i++) {
      await expect(
        client.verifyOtp({ challengeId: challenge.challengeId, code: '000000' }),
      ).rejects.toMatchObject({ code: 'AUTH_CHALLENGE_INVALID' });
    }
    await expect(
      client.verifyOtp({ challengeId: challenge.challengeId, code: '000000' }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('reports UPSTREAM_UNAVAILABLE when the provider is down', async () => {
    const { client } = makeClient({ providerDown: true });
    await expect(
      client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' }),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('reports NETWORK_ERROR during an offline window', async () => {
    const { client, setNow } = makeClient({ offlineWindowMs: 500 });
    setNow(100);
    await expect(
      client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('AuthFixtureClient session lifecycle', () => {
  it('refresh rotates the access token while keeping the principal', async () => {
    const { client } = makeClient();
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    const first = await client.verifyOtp({
      challengeId: challenge.challengeId,
      code: '123456',
    });
    const second = await client.refresh();
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.principal.userId).toBe(first.principal.userId);
  });

  it('me() and listSessions() require an authenticated session', async () => {
    const { client } = makeClient();
    await expect(client.me()).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
    await expect(client.listSessions()).rejects.toMatchObject({ code: 'AUTH_SESSION_INVALID' });
  });

  it('logout clears the in-memory session', async () => {
    const { client, store } = makeClient();
    const challenge = await client.requestOtp({ mobile: MOBILE, client: 'CUSTOMER_WEB' });
    await client.verifyOtp({ challengeId: challenge.challengeId, code: '123456' });
    expect(store.isAuthenticated()).toBe(true);
    await client.logout();
    expect(store.isAuthenticated()).toBe(false);
  });
});
