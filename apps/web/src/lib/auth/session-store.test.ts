import { describe, expect, it, vi } from 'vitest';
import {
  BrowserRefreshCoordinator,
  CrossTabSessionBus,
  MemorySessionStore,
  CROSS_TAB_CHANNEL,
  CROSS_TAB_REFRESH_LOCK,
} from './session-store';
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
    const channel = (bus as unknown as { channel: BroadcastChannel | null }).channel;
    channel?.onmessage?.({ data: { type: 'refresh-started' } } as MessageEvent<{
      type: 'refresh-started';
    }>);
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

  it('closes an unused channel and reopens it for a later subscriber', () => {
    const bus = new CrossTabSessionBus('test-channel');
    const unsubscribe = bus.subscribe(vi.fn());
    unsubscribe();
    expect((bus as unknown as { channel: BroadcastChannel | null }).channel).toBeNull();

    const secondUnsubscribe = bus.subscribe(vi.fn());
    expect((bus as unknown as { channel: BroadcastChannel | null }).channel).not.toBeNull();
    secondUnsubscribe();
  });
});

describe('BrowserRefreshCoordinator', () => {
  it('requests the named browser-wide exclusive lock', async () => {
    const calls: Array<{ name: string; options: { mode: 'exclusive'; signal: AbortSignal } }> = [];
    const locks = {
      async request<T>(
        name: string,
        options: { mode: 'exclusive'; signal: AbortSignal },
        operation: () => Promise<T>,
      ): Promise<T> {
        calls.push({ name, options });
        return operation();
      },
    };
    const coordinator = new BrowserRefreshCoordinator(locks, 100);

    await expect(coordinator.runExclusive(async () => 'ok')).resolves.toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe(CROSS_TAB_REFRESH_LOCK);
    expect(calls[0]?.options).toEqual(
      expect.objectContaining({ mode: 'exclusive', signal: expect.any(AbortSignal) }),
    );
  });

  it('fails closed after a bounded lock-acquisition timeout', async () => {
    const locks = {
      async request<T>(
        _name: string,
        options: { mode: 'exclusive'; signal: AbortSignal },
        operation: () => Promise<T>,
      ): Promise<T> {
        void operation;
        return new Promise<T>((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      },
    };
    const coordinator = new BrowserRefreshCoordinator(locks, 5);

    await expect(coordinator.runExclusive(async () => 'never')).rejects.toThrow(
      'AUTH_CROSS_TAB_LOCK_TIMEOUT',
    );
  });
});
