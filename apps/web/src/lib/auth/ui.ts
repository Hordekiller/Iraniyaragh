import { isValidOtpCode, normalizeIranianMobile, normalizeOtpCodeInput } from './normalize';
import type { AuthApi } from './api';
import type { MemorySessionStore, SessionSignal } from './session-store';
import { CrossTabSessionBus } from './session-store';
import type { AuthApiError } from './errors';
import type { CustomerOtpChallenge, AuthPrincipal } from './types';

/**
 * Customer OTP auth flow controller (customer login UX for #50).
 *
 * React-agnostic: owns the two-step OTP state machine, validation, resend/expiry
 * timing, error mapping and the silent session-restore protocol, exposing an
 * immutable snapshot + subscribe so the UI can render with `useSyncExternalStore`.
 * Business/Auth logic intentionally stays out of components (AGENTS.md).
 * No module-global mutable state.
 */

export type CustomerOtpPhase =
  | 'idle'
  | 'mobile' // awaiting the mobile number
  | 'code' // challenge active, waiting for the 6-digit code
  | 'authenticated'
  | 'session-expired';

/** Why the in-memory session was invalidated. `replayed` means the refresh family was revoked. */
export type SessionExpiryReason = 'invalid' | 'replayed';

export type CustomerOtpUiState = {
  phase: CustomerOtpPhase;
  mobile: string;
  code: string;
  /** True while an async call (request/verify/resend/logout) is in flight. */
  busy: boolean;
  /** True while a silent restore/refresh attempt is in flight. */
  restoring: boolean;
  /** Inline, Farsi-localized error message, or null. */
  error: string | null;
  /** Why the session ended, when `phase` is `session-expired`. */
  expiredReason: SessionExpiryReason | null;
  /** Resend is disabled until this epoch (ms). */
  resendNotBefore: number;
  /** Rate-limit back-off: submit attempts are locked until this epoch (ms). */
  rateLimitNotBefore: number;
  /** Challenge expires at this epoch (ms); null when none is active. */
  expiresAt: number | null;
  challenge: CustomerOtpChallenge | null;
  principal: AuthPrincipal | null;
};

const initialState: CustomerOtpUiState = {
  phase: 'idle',
  mobile: '',
  code: '',
  busy: false,
  restoring: false,
  error: null,
  expiredReason: null,
  resendNotBefore: 0,
  rateLimitNotBefore: 0,
  expiresAt: null,
  challenge: null,
  principal: null,
};

function isApiError(error: unknown): error is AuthApiError {
  return Boolean(
    error &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string',
  );
}

/** Map any thrown error to a Farsi user-facing message. */
function farsiError(error: unknown, mobile: string | null): string {
  if (isApiError(error)) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return 'شماره موبایل واردشده معتبر نیست.';
      case 'RATE_LIMITED':
        return 'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.';
      case 'AUTH_CHALLENGE_INVALID':
        return 'کد واردشده صحیح نیست.';
      case 'AUTH_CHALLENGE_EXPIRED':
        return 'کد منقضی شده است. کد جدید درخواست کنید.';
      case 'UPSTREAM_UNAVAILABLE':
      case 'INTERNAL_ERROR':
        return 'سرویس پیامک در دسترس نیست. چند دقیقه دیگر تلاش کنید.';
      case 'TIMEOUT':
      case 'NETWORK_ERROR':
        return 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کنید.';
      default:
        return 'ورود انجام نشد. دوباره تلاش کنید.';
    }
  }
  if (mobile && !normalizeIranianMobile(mobile)) {
    return 'شماره موبایل معتبر وارد کنید.';
  }
  return 'خطای ناشناخته؛ دوباره تلاش کنید.';
}

/**
 * A `CustomerOtpController` instance is a tiny subscribable store. The UI reads
 * `getState()` and subscribes via `subscribe()` (useSyncExternalStore).
 */
export class CustomerOtpController {
  private state: CustomerOtpUiState = initialState;
  private readonly listeners = new Set<() => void>();
  private readonly api: AuthApi;
  private readonly store: MemorySessionStore;
  private readonly inflight = new Set<string>();
  private readonly bus: CrossTabSessionBus | null;
  private readonly unsubscribeBus: (() => void) | null = null;
  /** True while a silent restore/refresh is in flight (single-flight). */
  private restoring = false;
  /** Another tab is already refreshing; defer until the bus reports completion. */
  private crossTabRefreshInFlight = false;
  /**
   * Once a refresh produced SESSION_INVALID/REPLAYED, never fire another
   * automatic silent refresh for this page lifetime: repeated automatic calls
   * would compound the rotation/replay instead of fixing it. Re-auth must be
   * deliberately triggered by the user (AUTH_CONTRACT §7, no auto-retry).
   */
  private silentRestoreLatch = false;
  /** Generation guard: bumped on close/logout/reset to discard stale async results. */
  private generation = 0;

  constructor(
    api: AuthApi,
    store: MemorySessionStore,
    private readonly now: () => number = () => Date.now(),
    bus?: CrossTabSessionBus,
  ) {
    this.api = api;
    this.store = store;
    this.bus = bus ?? null;
    if (this.bus) {
      this.unsubscribeBus = this.bus.subscribe(signal => this.onSignal(signal));
    }
    this.syncFromStore();
  }

  getState(): CustomerOtpUiState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private patch(partial: Partial<CustomerOtpUiState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private syncFromStore(): void {
    if (this.store.isExpired()) {
      this.patch({
        phase: 'session-expired',
        principal: null,
        expiredReason: this.store.expireReason() ?? 'invalid',
      });
      return;
    }
    const principal = this.store.getPrincipal();
    this.patch({
      phase: principal ? 'authenticated' : 'idle',
      principal,
    });
  }

  private onSignal(signal: SessionSignal): void {
    switch (signal.type) {
      case 'refresh-started':
        this.crossTabRefreshInFlight = true;
        break;
      case 'refresh-completed':
        this.crossTabRefreshInFlight = false;
        break;
      case 'refresh-failed':
        this.crossTabRefreshInFlight = false;
        this.applyCrossTabRefreshFailure(signal.reason);
        break;
      default:
        break;
    }
  }

  /**
   * A refresh somewhere in this browser revolved/replayed the shared family.
   * A tab still holding a live in-memory session must surface the forced re-auth
   * state; a tab that was already anonymous stays silently anonymous (no
   * misleading "session ended" notice). Either way no further automatic refresh
   * is attempted.
   */
  private applyCrossTabRefreshFailure(reason: SessionExpiryReason): void {
    this.silentRestoreLatch = true;
    if (this.store.isAuthenticated()) {
      this.expireSession(reason);
    }
  }

  private broadcast(signal: SessionSignal): void {
    this.bus?.broadcast(signal);
  }

  private expireSession(reason: SessionExpiryReason): void {
    this.store.expire(reason);
    this.generation += 1;
    this.patch({
      phase: 'session-expired',
      principal: null,
      expiredReason: reason,
      error: null,
      challenge: null,
      expiresAt: null,
      code: '',
      resendNotBefore: 0,
    });
  }

  /**
   * `true` when the thrown error means this tab's in-memory session is over and
   * the UI must force a re-auth (no retry). When it returns `true`, the
   * controller already switched the phase to `session-expired` — except for a
   * session-less store receiving `AUTH_SESSION_INVALID` during a silent restore,
   * which stays silently anonymous (a reload with no session is not an error).
   */
  private handleSessionFailure(error: unknown): boolean {
    if (!isApiError(error)) return false;
    const code = error.code;
    if (code === 'AUTH_SESSION_REPLAYED' || code === 'AUTH_SESSION_INVALID' || code === 'AUTH_REAUTHENTICATION_REQUIRED' || code === 'AUTH_CSRF_INVALID') {
      const sessionEnded = code === 'AUTH_SESSION_REPLAYED' || this.store.isAuthenticated();
      if (sessionEnded) {
        this.expireSession(code === 'AUTH_SESSION_REPLAYED' ? 'replayed' : 'invalid');
      }
      return true;
    }
    return false;
  }

  /**
   * User consent to re-authenticate after an expired/revoked session: clears the
   * forced state so the mobile step renders, and re-arms silent restore so a
   * future session can be refreshed normally.
   */
  retryAfterExpiry(): void {
    if (this.state.phase !== 'session-expired') return;
    this.store.clear();
    this.silentRestoreLatch = false;
    this.resetChallenge();
  }

  private begin(label: string): boolean {
    if (this.inflight.has(label)) return false;
    this.inflight.add(label);
    this.patch({ busy: true });
    return true;
  }

  private end(label: string): void {
    this.inflight.delete(label);
    this.patch({ busy: this.inflight.size > 0 });
  }

  open(): void {
    if (this.state.phase === 'authenticated') return;
    if (this.store.isExpired()) {
      this.patch({ phase: 'session-expired', error: null });
      return;
    }
    const phase: CustomerOtpPhase = this.state.challenge ? 'code' : 'mobile';
    this.patch({ phase, error: null });
  }

  close(): void {
    if (this.state.phase === 'authenticated') return;
    this.generation += 1;
    this.patch({
      phase: 'idle',
      code: '',
      error: null,
      expiredReason: null,
      challenge: null,
      expiresAt: null,
      resendNotBefore: 0,
    });
  }

  resetChallenge(error: string | null = null): void {
    if (this.state.phase === 'authenticated') return;
    this.generation += 1;
    this.patch({
      phase: 'mobile',
      code: '',
      error,
      expiredReason: null,
      challenge: null,
      expiresAt: null,
      resendNotBefore: 0,
    });
  }

  expireChallenge(): void {
    if (
      this.state.phase !== 'code' ||
      this.state.expiresAt === null ||
      this.now() < this.state.expiresAt
    ) {
      return;
    }
    this.resetChallenge('کد منقضی شده است. کد جدید درخواست کنید.');
  }

  setMobile(mobile: string): void {
    this.patch({ mobile, error: null });
  }

  setCode(code: string): void {
    this.patch({ code: normalizeOtpCodeInput(code), error: null });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  async requestOtp(): Promise<void> {
    if (this.state.phase === 'authenticated') return;
    if (this.isRateLimited()) {
      this.patch({ error: 'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.' });
      return;
    }
    if (!this.begin('request')) return;

    const wasOpen = this.state.phase;
    const mobile = normalizeIranianMobile(this.state.mobile);
    if (!mobile) {
      this.end('request');
      this.patch({ error: 'شماره موبایل معتبر وارد کنید.', phase: wasOpen === 'idle' ? 'mobile' : wasOpen });
      return;
    }

    const generation = this.generation;
    try {
      const challenge = await this.api.requestOtp({ mobile, client: 'CUSTOMER_WEB' });
      if (generation !== this.generation) return;
      this.patch({
        phase: 'code',
        challenge,
        mobile,
        code: '',
        error: null,
        resendNotBefore: this.now() + challenge.resendAfterSeconds * 1000,
        expiresAt: this.now() + challenge.expiresInSeconds * 1000,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.applyRateLimit(error);
      this.patch({ error: farsiError(error, mobile) });
    } finally {
      this.end('request');
    }
  }

  /** Re-request a fresh challenge while staying on the code step. */
  async resend(): Promise<void> {
    if (this.state.phase !== 'code') return;
    if (this.now() < this.state.resendNotBefore) return;
    await this.requestOtp();
  }

  async verifyOtp(): Promise<void> {
    if (this.state.phase !== 'code' || !this.state.challenge) return;
    if (this.isRateLimited()) {
      this.patch({ error: 'درخواست‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.' });
      return;
    }
    if (!this.begin('verify')) return;

    const code = this.state.code;
    if (!isValidOtpCode(code)) {
      this.end('verify');
      this.patch({ error: 'کد باید ۶ رقم باشد.' });
      return;
    }

    const generation = this.generation;
    try {
      const challengeId = this.state.challenge.challengeId;
      const result = await this.api.verifyOtp({ challengeId, code });
      if (generation !== this.generation) {
        await this.api.logout().catch(() => undefined);
        this.store.clear();
        return;
      }
      this.patch({
        phase: 'authenticated',
        principal: result.principal,
        challenge: null,
        expiresAt: null,
        code: '',
        error: null,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      if (isApiError(error) && error.code === 'AUTH_CHALLENGE_EXPIRED') {
        this.resetChallenge('کد منقضی شده است. کد جدید درخواست کنید.');
        return;
      }
      if (this.handleSessionFailure(error)) return;
      this.applyRateLimit(error);
      this.patch({ error: farsiError(error, this.state.mobile) });
    } finally {
      this.end('verify');
    }
  }

  /**
   * Silently restore a still-valid session (single-flight). Called once per
   * provider mount: a reload re-reads the memory store, so the call only fires
   * when the latch allows it. Once it fails with a session/CSRF code the latch
   * prevents any further automatic silent refresh (no auto-retry). After an
   * explicit expiry the phase is `session-expired` and re-auth is user-driven.
   */
  async restoreSession(): Promise<boolean> {
    if (this.store.isExpired()) return false;
    if (this.silentRestoreLatch) return false;
    return this.refreshSession();
  }

  /** Single-flight refresh shared by the restore path and the cross-tab bus. */
  async refreshSession(): Promise<boolean> {
    if (this.store.isExpired()) return false;
    if (this.silentRestoreLatch) return false;
    if (this.restoring) return false;
    if (this.crossTabRefreshInFlight) return false;

    this.restoring = true;
    this.patch({ restoring: true });
    this.broadcast({ type: 'refresh-started' });

    let ok = true;
    const generation = this.generation;
    try {
      const refreshed = await this.api.refresh();
      if (generation !== this.generation) return false;
      this.patch({ phase: 'authenticated', principal: refreshed.principal, error: null });
      this.broadcast({ type: 'refresh-completed' });
    } catch (error) {
      if (generation !== this.generation) {
        return false;
      }
      ok = false;
      if (!isApiError(error)) {
        this.applyRateLimit(error);
        return false;
      }
      const code = error.code;
      if (code === 'AUTH_SESSION_REPLAYED') {
        this.silentRestoreLatch = true;
        this.expireSession('replayed');
        this.broadcast({ type: 'refresh-failed', reason: 'replayed' });
      } else if (code === 'AUTH_SESSION_INVALID' || code === 'AUTH_REAUTHENTICATION_REQUIRED' || code === 'AUTH_CSRF_INVALID') {
        this.silentRestoreLatch = true;
        if (this.store.isAuthenticated()) {
          this.expireSession('invalid');
        }
        // A session-less browser found no session: stay silently anonymous.
      } else {
        this.applyRateLimit(error);
      }
    } finally {
      this.restoring = false;
      this.patch({ restoring: false });
    }
    return ok;
  }

  /** True while a rate-limit back-off window is still active. */
  private isRateLimited(): boolean {
    return this.now() < this.state.rateLimitNotBefore;
  }

  /** If the error is a rate-limit response, arm the back-off window. */
  private applyRateLimit(error: unknown): void {
    if (isApiError(error) && error.code === 'RATE_LIMITED') {
      const waitSeconds = error.retryAfterSeconds ?? 5;
      this.patch({ rateLimitNotBefore: this.now() + waitSeconds * 1000 });
    }
  }

  async logout(): Promise<void> {
    if (!this.begin('logout')) return;
    try {
      await this.api.logout();
    } catch {
      // Best-effort; the local in-memory session is cleared regardless.
    } finally {
      this.store.clear();
      this.generation += 1;
      this.silentRestoreLatch = false;
      this.restoring = false;
      this.patch({ ...initialState, busy: true });
      this.end('logout');
    }
  }
}

export { initialState as initialCustomerOtpState };
