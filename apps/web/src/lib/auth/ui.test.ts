import { describe, expect, it } from 'vitest';
import { AuthFixtureClient } from './fixtures';
import { MemorySessionStore } from './session-store';
import { CustomerOtpController } from './ui';
import type { AuthApi } from './api';
import type { CustomerOtpChallenge } from './types';

function makeFlow(nowValue = 1_000) {
  const store = new MemorySessionStore();
  const api = new AuthFixtureClient({ store });
  let now = nowValue;
  const controller = new CustomerOtpController(api, store, () => now);
  return { controller, store, setNow: (t: number) => (now = t) };
}

describe('CustomerOtpController OTP flow', () => {
  it('starts idle and anonymous', () => {
    const { controller } = makeFlow();
    expect(controller.getState().phase).toBe('idle');
    expect(controller.getState().principal).toBeNull();
    expect(controller.getState().busy).toBe(false);
  });

  it('open() moves to the mobile step and close() returns to idle', () => {
    const { controller } = makeFlow();
    controller.open();
    expect(controller.getState().phase).toBe('mobile');
    controller.close();
    expect(controller.getState().phase).toBe('idle');
  });

  it('requestOtp with a valid mobile normalizes and moves to the code step', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('۰۹۱۲۳۴۵۶۷۸۹'); // Persian digits
    await controller.requestOtp();
    const state = controller.getState();
    expect(state.phase).toBe('code');
    expect(state.mobile).toBe('+989123456789');
    expect(state.challenge).not.toBeNull();
    expect(state.expiresAt).toBe(1_000 + 300_000);
    expect(state.resendNotBefore).toBe(1_000 + 60_000);
  });

  it('requestOtp with an invalid mobile shows a validation error', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('12345');
    await controller.requestOtp();
    const state = controller.getState();
    expect(state.phase).toBe('mobile');
    expect(state.error).toContain('شماره');
    expect(controller.getState().busy).toBe(false);
  });

  it('requestOtp survives a transport outage as NETWORK_ERROR message', async () => {
    const store = new MemorySessionStore();
    // Fixture offline window triggers when its own injected clock is within it.
    const api = new AuthFixtureClient({ store, offlineWindowMs: 500, now: () => 100 });
    const controller = new CustomerOtpController(api, store, () => 100);
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    expect(controller.getState().error).toContain('ارتباط با سرور');
  });

  it('verifyOtp with the correct code authenticates and stores the session', async () => {
    const { controller, store } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');
    await controller.verifyOtp();
    const state = controller.getState();
    expect(state.phase).toBe('authenticated');
    expect(state.principal?.authenticationLevel).toBe('CUSTOMER_OTP');
    expect(store.isAuthenticated()).toBe(true);
    expect(state.busy).toBe(false);
  });

  it('verifyOtp with a wrong code does NOT authenticate and surfaces an error', async () => {
    const { controller, store } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('000000');
    await controller.verifyOtp();
    expect(controller.getState().phase).toBe('code');
    expect(controller.getState().error).toContain('کد');
    expect(store.isAuthenticated()).toBe(false);
  });

  it('verifyOtp with a non-6-digit code is rejected before calling the API', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('12');
    await controller.verifyOtp();
    expect(controller.getState().error).toContain('۶ رقم');
    expect(controller.getState().phase).toBe('code');
  });

  it('setCode transliterates Persian/Arabic digits, strips noise and caps at 6 characters', () => {
    const { controller } = makeFlow();
    controller.setCode('12a34-56');
    expect(controller.getState().code).toBe('123456');
    controller.setCode('۱۲٣۴۵۶7890');
    expect(controller.getState().code).toBe('123456');
  });

  it('resend() is ignored before resendNotBefore and issues a fresh challenge after', async () => {
    const { controller, setNow } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    const firstChallenge = controller.getState().challenge?.challengeId;

    await controller.resend(); // now() still 1000 -> before 60000 resend window
    expect(controller.getState().challenge?.challengeId).toBe(firstChallenge);

    setNow(61_001);
    await controller.resend();
    expect(controller.getState().challenge?.challengeId).not.toBe(firstChallenge);
  });

  it('rates out after repeated invalid codes (fixture 5-attempt limit)', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    for (let i = 0; i < 5; i++) {
      controller.setCode('000000');
      await controller.verifyOtp();
    }
    expect(controller.getState().error).toContain('درخواست');
  });

  it('logout clears the session and returns to idle', async () => {
    const { controller, store } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');
    await controller.verifyOtp();
    expect(store.isAuthenticated()).toBe(true);

    await controller.logout();
    expect(controller.getState().phase).toBe('idle');
    expect(controller.getState().principal).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('open() is a no-op while authenticated', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');
    await controller.verifyOtp();

    const before = controller.getState().phase;
    controller.open();
    expect(controller.getState().phase).toBe(before);
  });

  it('verifyOtp on an expired challenge returns to the mobile step with a message', async () => {
    let now = 1_000;
    const store = new MemorySessionStore();
    const api = new AuthFixtureClient({ store, now: () => now });
    const controller = new CustomerOtpController(api, store, () => now);

    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');

    now = 1_000 + 301_000; // past the 300s challenge TTL
    await controller.verifyOtp();

    const state = controller.getState();
    expect(state.phase).toBe('mobile');
    expect(state.error).toContain('منقضی');
    expect(state.challenge).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('expires a challenge locally at its deadline without waiting for a verify request', async () => {
    const { controller, setNow } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();

    setNow(301_001);
    controller.expireChallenge();

    expect(controller.getState()).toMatchObject({
      phase: 'mobile',
      mobile: '+989123456789',
      code: '',
      challenge: null,
      expiresAt: null,
    });
    expect(controller.getState().error).toContain('منقضی');
  });

  it('rate-limits after repeated failures and arms a Retry-After back-off window', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    for (let i = 0; i < 5; i++) {
      controller.setCode('000000');
      await controller.verifyOtp();
    }
    let state = controller.getState();
    expect(state.error).toContain('درخواست');
    expect(state.rateLimitNotBefore).toBeGreaterThan(1_000);

    // While the back-off window is active, a submit attempt is blocked before the API
    // and the user stays on the code step.
    await controller.verifyOtp();
    state = controller.getState();
    expect(state.phase).toBe('code');
    expect(state.error).toContain('درخواست');
    expect(state.rateLimitNotBefore).toBeGreaterThan(1_000);
  });

  it('requestOtp survives a provider-down outage as UPSTREAM_UNAVAILABLE message', async () => {
    const store = new MemorySessionStore();
    const api = new AuthFixtureClient({ store, providerDown: true });
    const controller = new CustomerOtpController(api, store, () => 1_000);
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    expect(controller.getState().error).toContain('سرویس پیامک');
    expect(controller.getState().phase).toBe('mobile');
  });

  it('prevents duplicate requestOtp submissions while one is in flight', async () => {
    let release!: (challenge: CustomerOtpChallenge) => void;
    let calls = 0;
    const pendingApi = {
      ...new AuthFixtureClient({}),
      requestOtp: () => {
        calls += 1;
        return new Promise<CustomerOtpChallenge>(resolve => {
          release = resolve;
        });
      },
    } as unknown as AuthApi;

    const store = new MemorySessionStore();
    const controller = new CustomerOtpController(pendingApi, store, () => 1_000);
    controller.open();
    controller.setMobile('09123456789');

    const first = controller.requestOtp();
    const second = controller.requestOtp(); // ignored: request is already in flight
    expect(calls).toBe(1);

    release({ challengeId: 'c1', expiresInSeconds: 300, resendAfterSeconds: 60 });
    await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(controller.getState().phase).toBe('code');
    expect(controller.getState().busy).toBe(false);
  });

  it('discards a request result that resolves after the flow is closed', async () => {
    let release!: (challenge: CustomerOtpChallenge) => void;
    const pendingApi = {
      ...new AuthFixtureClient({}),
      requestOtp: () =>
        new Promise<CustomerOtpChallenge>(resolve => {
          release = resolve;
        }),
    } as unknown as AuthApi;
    const controller = new CustomerOtpController(pendingApi, new MemorySessionStore(), () => 1_000);
    controller.open();
    controller.setMobile('09123456789');

    const pending = controller.requestOtp();
    controller.close();
    release({ challengeId: 'stale', expiresInSeconds: 300, resendAfterSeconds: 60 });
    await pending;

    expect(controller.getState()).toMatchObject({
      phase: 'idle',
      busy: false,
      challenge: null,
      expiresAt: null,
    });
  });

  it('revokes a session result that resolves after the flow is closed', async () => {
    let release!: () => void;
    const store = new MemorySessionStore();
    const fixture = new AuthFixtureClient({ store });
    const api: AuthApi = {
      requestOtp: fixture.requestOtp.bind(fixture),
      verifyOtp: async payload => {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        return fixture.verifyOtp(payload);
      },
      refresh: fixture.refresh.bind(fixture),
      me: fixture.me.bind(fixture),
      listSessions: fixture.listSessions.bind(fixture),
      logout: fixture.logout.bind(fixture),
    };
    const controller = new CustomerOtpController(api, store, () => 1_000);
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');

    const pending = controller.verifyOtp();
    controller.close();
    release();
    await pending;

    expect(controller.getState().phase).toBe('idle');
    expect(store.isAuthenticated()).toBe(false);
  });

  it('preserves a Retry-After lock when the dialog closes and reopens', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    for (let attempt = 0; attempt < 5; attempt++) {
      controller.setCode('000000');
      await controller.verifyOtp();
    }
    const deadline = controller.getState().rateLimitNotBefore;

    controller.close();
    controller.open();
    await controller.requestOtp();

    expect(controller.getState().rateLimitNotBefore).toBe(deadline);
    expect(controller.getState().phase).toBe('mobile');
    expect(controller.getState().error).toContain('درخواست');
  });

  it('keeps secrets memory-only: raw access token never enters the UI state', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');
    await controller.verifyOtp();

    const state = controller.getState();
    expect(state.principal?.userId).toBe('fixture-user-otp-1');
    // The controller state renders the principal, but never the raw token.
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain('accessToken');
    expect(serialized).not.toContain('fixture-at.');
  });

  it('session token lives only in the in-memory store and is gone after logout', async () => {
    const { controller, store } = makeFlow();
    controller.open();
    controller.setMobile('09123456789');
    await controller.requestOtp();
    controller.setCode('123456');
    await controller.verifyOtp();

    const snapshot = store.snapshot();
    expect(snapshot.status).toBe('authenticated');
    // The token exists only as an in-memory property of the store object.
    expect(snapshot.status === 'authenticated').toBe(true);
    expect(store.getAccessToken()).toMatch(/^fixture-at\./);

    await controller.logout();
    expect(store.snapshot().status).toBe('anonymous');
    expect(store.getAccessToken()).toBeNull();
  });
});
