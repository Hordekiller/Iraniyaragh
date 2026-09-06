import { describe, expect, it } from 'vitest';
import { StaffAuthFixtureClient } from '../staff-fixture';
import { StaffLoginController } from '../staff-login';
import type { StaffAuthApi, StaffTokenStore } from '../staff-api';
import { StaffAuthError } from '../staff-api';
import type { AuthPrincipal, StaffMfaChallenge, AccessTokenData } from '../staff-types';

const IDENTIFIER = 'ops@iranyaragh.local';
const PASSWORD = 'FixtuRe-E2E-Admin!2026';
const TOTP = '654321';

function memoryTokenStore(): StaffTokenStore {
  let token: string | null = null;
  return {
    get: () => token,
    set: (value: string | null) => {
      token = value;
    },
  };
}

function makeFlow(nowValue = 1_000) {
  const store = memoryTokenStore();
  const api = new StaffAuthFixtureClient({
    identifier: IDENTIFIER,
    password: PASSWORD,
    totpCode: TOTP,
    retryAfterSeconds: 0, // lock-out releases immediately once the window passes
    now: () => now,
  });
  let now = nowValue;
  const controller = new StaffLoginController(api, store, () => now);
  return { controller, store, api, setNow: (t: number) => (now = t) };
}

async function completeLogin(controller: StaffLoginController) {
  controller.setIdentifier(IDENTIFIER);
  controller.setPassword(PASSWORD);
  await controller.submitPassword();
  controller.setCode(TOTP);
  await controller.submitTotp();
}

describe('StaffLoginController lifecycle', () => {
  it('starts idle, anonymous and not busy', () => {
    const { controller } = makeFlow();
    const state = controller.getState();
    expect(state.phase).toBe('idle');
    expect(state.principal).toBeNull();
    expect(state.busy).toBe(false);
    expect(state.challengeToken).toBeNull();
  });

  it('open() moves to the password step and close() returns to idle', () => {
    const { controller } = makeFlow();
    controller.open();
    expect(controller.getState().phase).toBe('password');
    controller.close();
    expect(controller.getState().phase).toBe('idle');
  });

  it('open() is an identity no-op while authenticated', async () => {
    const { controller } = makeFlow();
    await completeLogin(controller);
    controller.open();
    expect(controller.getState().phase).toBe('authenticated');
  });
});

describe('StaffLoginController password step', () => {
  it('rejects empty identifier/password client-side', async () => {
    const { controller } = makeFlow();
    controller.open();
    await controller.submitPassword();
    const state = controller.getState();
    expect(state.phase).toBe('password');
    expect(state.error).toBe('شناسه و رمز عبور را وارد کنید.');
  });

  it('maps invalid credentials to a Farsi message and stays on password', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword('wrong-password');
    await controller.submitPassword();
    const state = controller.getState();
    expect(state.phase).toBe('password');
    expect(state.error).toBe('شناسه یا رمز عبور نادرست است.');
  });

  it('moves to the totp step and stashes the challenge on success', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword(PASSWORD);
    await controller.submitPassword();
    const state = controller.getState();
    expect(state.phase).toBe('totp');
    expect(state.challengeToken).not.toBeNull();
    expect(state.expiresAt).toBe(1_000 + 300_000);
  });

  it('does not leave the password in the UI state after success', async () => {
    const { controller } = makeFlow();
    await completeLogin(controller);
    expect(controller.getState().password).toBe('');
  });
});

describe('StaffLoginController totp step', () => {
  it('rejects a non-six-digit code client-side', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword(PASSWORD);
    await controller.submitPassword();
    controller.setCode('12');
    await controller.submitTotp();
    const state = controller.getState();
    expect(state.phase).toBe('totp');
    expect(state.error).toBe('کد تایید باید ۶ رقم باشد.');
  });

  it('maps an invalid code to a Farsi message', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword(PASSWORD);
    await controller.submitPassword();
    controller.setCode('000000');
    await controller.submitTotp();
    expect(controller.getState().error).toBe('کد تایید نادرست است.');
  });

  it('authenticates, stores the token and clears challenge state', async () => {
    const { controller, store } = makeFlow();
    await completeLogin(controller);
    const state = controller.getState();
    expect(state.phase).toBe('authenticated');
    expect(state.principal?.authenticationLevel).toBe('STAFF_MFA');
    expect(state.challengeToken).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(store.get()).toMatch(/^fixture-staff-at\./);
  });

  it('resetToPassword clears the stale challenge and returns to password', async () => {
    const { controller } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword(PASSWORD);
    await controller.submitPassword();
    controller.resetToPassword();
    const state = controller.getState();
    expect(state.phase).toBe('password');
    expect(state.challengeToken).toBeNull();
  });
});

describe('StaffLoginController rate limiting', () => {
  it('arms the lock-out window after repeated failures and blocks submits', async () => {
    const { controller, setNow } = makeFlow();
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword('wrong');
    for (let i = 0; i < 5; i += 1) {
      await controller.submitPassword();
    }
    expect(controller.getState().error).toBe('تلاش‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.');

    // retryAfterSeconds is 0, so the window closes as soon as time advances.
    setNow(2_000);
    controller.setPassword(PASSWORD);
    await controller.submitPassword();
    expect(controller.getState().phase).toBe('totp');
  });
});

describe('StaffLoginController session recovery', () => {
  it('refreshSession marks session-expired and drops the token when me() fails', async () => {
    const { controller, store, api } = makeFlow();
    await completeLogin(controller);
    await api.logout(); // simulate server-side end of session
    await controller.refreshSession();
    const state = controller.getState();
    expect(state.phase).toBe('session-expired');
    expect(state.principal).toBeNull();
    expect(store.get()).toBeNull();
  });

  it('refreshSession maps revoked access to the forbidden phase', async () => {
    const { controller, api } = makeFlow();
    await completeLogin(controller);
    api.revoke();
    await controller.refreshSession();
    expect(controller.getState().phase).toBe('forbidden');
  });
});

describe('StaffLoginController concurrency guard', () => {
  it('discards a stale password result after close()', async () => {
    let resolvePassword!: (challenge: StaffMfaChallenge) => void;
    const api: StaffAuthApi = {
      passwordRequest: () =>
        new Promise<StaffMfaChallenge>(resolve => {
          resolvePassword = resolve;
        }),
      totpVerify: async (): Promise<AccessTokenData> => {
        throw new Error('unreachable in this test');
      },
      me: async (): Promise<AuthPrincipal> => {
        throw new StaffAuthError({ code: 'AUTH_SESSION_INVALID', message: 'expired' });
      },
      logout: async () => undefined,
    };
    const store = memoryTokenStore();
    const controller = new StaffLoginController(api, store, () => 1_000);
    controller.open();
    controller.setIdentifier(IDENTIFIER);
    controller.setPassword(PASSWORD);
    const pending = controller.submitPassword();
    controller.close(); // bump generation while the request is still in flight
    resolvePassword!({
      challengeToken: 'stale',
      next: 'TOTP',
      expiresInSeconds: 300,
    });
    await pending;
    expect(controller.getState().phase).toBe('idle');
    expect(controller.getState().challengeToken).toBeNull();
  });
});

describe('StaffLoginController logout', () => {
  it('resets to the initial state and clears the token', async () => {
    const { controller, store } = makeFlow();
    await completeLogin(controller);
    await controller.logout();
    const state = controller.getState();
    expect(state.phase).toBe('idle');
    expect(state.principal).toBeNull();
    expect(store.get()).toBeNull();
  });
});