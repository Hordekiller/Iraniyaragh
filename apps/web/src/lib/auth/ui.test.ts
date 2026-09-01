import { describe, expect, it } from 'vitest';
import { AuthFixtureClient } from './fixtures';
import { MemorySessionStore } from './session-store';
import { CustomerOtpController } from './ui';

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

  it('setCode strips non-digits and caps at 6 characters', () => {
    const { controller } = makeFlow();
    controller.setCode('12a34-56');
    expect(controller.getState().code).toBe('123456');
    controller.setCode('1234567890');
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
});
