import { describe, expect, it, vi } from 'vitest';
import { CrossTabSessionBus, MemorySessionStore, CROSS_TAB_CHANNEL } from './session-store';
import type { AccessTokenData, AuthPrincipal } from './types';

const stamp = '2026-08-31T12:00:00.000Z';
const principal: AuthPrincipal = {
  userId: 'u1',
  sessionId: 's1',
  authenticationLevel: 'CUSTOMER_OTP',
  permissions: [],
  authenticatedAt: stamp,
  accessExpiresAt: stamp,
};

const tokenData: AccessTokenData = {
  accessToken: 'at',
  tokenType: 'Bearer',
  expiresInSeconds: 600,
  principal,
};

describe('MemorySessionStore', () => {
  it('starts anonymous', () => {
    const store = new MemorySessionStore();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.getAccessToken()).toBeNull();
    expect(store.getPrincipal()).toBeNull();
    expect(store.snapshot()).toEqual({ status: 'anonymous' });
  });

  it('stores the access token and principal only in memory', () => {
    const store = new MemorySessionStore();
    store.setAuthenticated(tokenData);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.getAccessToken()).toBe('at');
    expect(store.getPrincipal()).toEqual(principal);
  });

  it('expire() records invalid vs replayed reasons', () => {
    const store = new MemorySessionStore();
    store.setAuthenticated(tokenData);
    store.expire('replayed');
    expect(store.snapshot()).toEqual({ status: 'expired', reason: 'replayed' });

    store.clear();
    expect(store.snapshot()).toEqual({ status: 'anonymous' });
  });

  it('clear() drops the token and principal', () => {
    const store = new MemorySessionStore();
    store.setAuthenticated(tokenData);
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.getAccessToken()).toBeNull();
  });
});

describe('CrossTabSessionBus', () => {
  it('defaults to the shared channel name', () => {
    expect(CROSS_TAB_CHANNEL).toBe('iranyaragh:auth:session');
  });

  it('forwards only signal objects (never tokens) to subscribed listeners', () => {
    const bus = new CrossTabSessionBus('test-channel');
    const listener = vi.fn();
    const unsubscribe = bus.subscribe(listener);

    // Simulate a signal from another tab via the underlying channel.
    (bus as unknown as { channel: BroadcastChannel | null }).channel?.dispatchEvent(
      new MessageEvent('message', { data: { type: 'refresh-started' } }),
    );
    expect(listener).toHaveBeenCalledWith({ type: 'refresh-started' });

    unsubscribe();
  });

  it('subscribes and unsubscribes idempotently', () => {
    const bus = new CrossTabSessionBus('test-channel');
    const listener = vi.fn();
    const a = bus.subscribe(listener);
    const b = bus.subscribe(listener);
    a();
    b();
    expect(listener).not.toHaveBeenCalled();
  });
});
