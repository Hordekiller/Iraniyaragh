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

/**
 * A @type {MessageChannel}-defaulted, token-free cross-tab signal bus used for
 * the single-flight refresh protocol. Nothing secret is ever sent on it.
 */
export class CrossTabSessionBus {
  private readonly channel: BroadcastChannel | null;
  private readonly listeners: Set<(signal: SessionSignal) => void> = new Set();

  constructor(
    channelName: string = CROSS_TAB_CHANNEL,
    testBroadcast: ((signal: SessionSignal) => void) | null = null,
  ) {
    this.channel =
      typeof BroadcastChannel === 'undefined' || testBroadcast
        ? null
        : new BroadcastChannel(channelName);

    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<SessionSignal>) => {
        for (const listener of this.listeners) listener(event.data);
      };
    }
    this.broadcast = testBroadcast ?? this.broadcast;
  }

  broadcast = (signal: SessionSignal): void => {
    this.channel?.postMessage(signal);
  };

  subscribe(listener: (signal: SessionSignal) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.channel?.close();
    this.listeners.clear();
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
