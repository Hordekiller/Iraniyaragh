import type { AccessTokenData, AuthPrincipal } from './types';

/**
 * Browser session state for the storefront auth client.
 *
 * The access token and principal are held ONLY in memory: never written to
 * LocalStorage, SessionStorage, cookies, IndexedDB, service-worker cache,
 * analytics or error-report payloads (AUTH_CONTRACT §4.1). A page reload
 * therefore returns the user to the anonymous/storefront state; the refresh
 * cookie (managed server-side and HttpOnly) is what a later slice uses to
 * restore a session silently.
 *
 * Cross-tab coordination transmits only state/result *signals* (never raw
 * tokens) so that a single refresh is kept in flight across tabs and a losing
 * concurrent refresh can revoke the family exactly once.
 */

export type AuthSessionState =
  | { status: 'anonymous' }
  | { status: 'authenticated'; accessToken: string; principal: AuthPrincipal }
  /** A refresh failed with AUTH_SESSION_INVALID / AUTH_SESSION_REPLAYED. */
  | { status: 'expired'; reason: 'invalid' | 'replayed' };

export type SessionSignal =
  | { type: 'auth-changed'; authenticationLevel?: AuthPrincipal['authenticationLevel'] }
  | { type: 'refresh-started' }
  | { type: 'refresh-completed' }
  | { type: 'refresh-failed'; reason: 'invalid' | 'replayed' };

export const CROSS_TAB_CHANNEL = 'iranyaragh:auth:session';
export const CROSS_TAB_REFRESH_LOCK = 'iranyaragh:auth:refresh';

/**
 * A @type {MessageChannel}-defaulted, token-free cross-tab signal bus used for
 * the single-flight refresh protocol. Nothing secret is ever sent on it.
 */
export class CrossTabSessionBus {
  private channel: BroadcastChannel | null = null;
  private readonly listeners: Set<(signal: SessionSignal) => void> = new Set();
  private readonly channelName: string;
  private readonly testBroadcast: ((signal: SessionSignal) => void) | null;

  constructor(
    channelName: string = CROSS_TAB_CHANNEL,
    testBroadcast: ((signal: SessionSignal) => void) | null = null,
  ) {
    this.channelName = channelName;
    this.testBroadcast = testBroadcast;
    this.open();
    this.broadcast = testBroadcast ?? this.broadcast;
  }

  open(): void {
    if (this.channel || typeof BroadcastChannel === 'undefined' || this.testBroadcast) return;
    this.channel = new BroadcastChannel(this.channelName);
    this.channel.onmessage = (event: MessageEvent<SessionSignal>) => {
      for (const listener of this.listeners) listener(event.data);
    };
  }

  broadcast = (signal: SessionSignal): void => {
    this.channel?.postMessage(signal);
  };

  subscribe(listener: (signal: SessionSignal) => void): () => void {
    this.open();
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.close();
    };
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }
}

export interface RefreshCoordinator {
  runExclusive<T>(operation: () => Promise<T>): Promise<T>;
}

type BrowserLockManager = {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; signal: AbortSignal },
    operation: () => Promise<T>,
  ): Promise<T>;
};

/** Same-page fallback used by controller-level tests and non-browser consumers. */
export class LocalRefreshCoordinator implements RefreshCoordinator {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release = (): void => undefined;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

/**
 * Browser-wide refresh mutex. Web Locks is the authority: BroadcastChannel is
 * deliberately not treated as a lock because two tabs can announce
 * simultaneously and replay a rotating refresh cookie.
 */
export class BrowserRefreshCoordinator implements RefreshCoordinator {
  constructor(
    private readonly locks: BrowserLockManager | null =
      typeof navigator === 'undefined'
        ? null
        : (navigator.locks as unknown as BrowserLockManager),
    private readonly acquisitionTimeoutMs = 10_000,
  ) {}

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.locks) {
      throw new Error('AUTH_CROSS_TAB_LOCK_UNAVAILABLE');
    }
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), this.acquisitionTimeoutMs);
    try {
      return await this.locks.request(
        CROSS_TAB_REFRESH_LOCK,
        { mode: 'exclusive', signal: abort.signal },
        async () => {
          clearTimeout(timeout);
          return operation();
        },
      );
    } catch (error) {
      if (abort.signal.aborted) throw new Error('AUTH_CROSS_TAB_LOCK_TIMEOUT');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class MemorySessionStore {
  private state: AuthSessionState = { status: 'anonymous' };

  setAuthenticated(data: AccessTokenData): void {
    this.state = {
      status: 'authenticated',
      accessToken: data.accessToken,
      principal: data.principal,
    };
  }

  getAccessToken(): string | null {
    return this.state.status === 'authenticated' ? this.state.accessToken : null;
  }

  getPrincipal(): AuthPrincipal | null {
    return this.state.status === 'authenticated' ? this.state.principal : null;
  }

  isAuthenticated(): boolean {
    return this.state.status === 'authenticated';
  }

  isExpired(): boolean {
    return this.state.status === 'expired';
  }

  getStatus(): AuthSessionState['status'] {
    return this.state.status;
  }

  expireReason(): 'invalid' | 'replayed' | null {
    return this.state.status === 'expired' ? this.state.reason : null;
  }

  expire(reason: 'invalid' | 'replayed' = 'invalid'): void {
    this.state = { status: 'expired', reason };
  }

  /** Clear all in-memory auth state (logout / refresh failure / CSRF clear). */
  clear(): void {
    this.state = { status: 'anonymous' };
  }

  snapshot(): AuthSessionState {
    return this.state;
  }
}
