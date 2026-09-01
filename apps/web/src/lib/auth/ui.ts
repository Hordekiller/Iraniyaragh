import { normalizeIranianMobile, isValidOtpCode } from './normalize';
import type { AuthApi } from './api';
import type { MemorySessionStore } from './session-store';
import type { AuthApiError } from './errors';
import type { CustomerOtpChallenge, AuthPrincipal } from './types';

/**
 * Customer OTP auth flow controller (customer login UX for #50).
 *
 * React-agnostic: owns the two-step OTP state machine, validation, resend/expiry
 * timing and error mapping, exposing an immutable snapshot + subscribe so the UI
 * can render with `useSyncExternalStore`. Business/Auth logic intentionally stays
 * out of components (AGENTS.md). No module-global mutable state.
 */

export type CustomerOtpPhase =
  | 'idle'
  | 'mobile' // awaiting the mobile number
  | 'code' // challenge active, waiting for the 6-digit code
  | 'authenticated'
  | 'session-expired';

export type CustomerOtpUiState = {
  phase: CustomerOtpPhase;
  mobile: string;
  code: string;
  /** True while an async call (request/verify/resend/logout) is in flight. */
  busy: boolean;
  /** Inline, Farsi-localized error message, or null. */
  error: string | null;
  /** Resend is disabled until this epoch (ms). */
  resendNotBefore: number;
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
  error: null,
  resendNotBefore: 0,
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
  /** Generation guard: bumped on logout/reset to discard stale async results. */
  private generation = 0;

  constructor(
    api: AuthApi,
    store: MemorySessionStore,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.api = api;
    this.store = store;
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
    const principal = this.store.getPrincipal();
    this.patch({
      phase: principal ? 'authenticated' : 'idle',
      principal,
    });
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
    const phase: CustomerOtpPhase = this.state.challenge ? 'code' : 'mobile';
    this.patch({ phase, error: null });
  }

  close(): void {
    if (this.state.phase === 'authenticated') return;
    this.patch({ phase: 'idle', code: '', error: null, challenge: null, expiresAt: null });
  }

  setMobile(mobile: string): void {
    this.patch({ mobile, error: null });
  }

  setCode(code: string): void {
    this.patch({ code: code.replace(/\D/g, '').slice(0, 6), error: null });
  }

  clearError(): void {
    this.patch({ error: null });
  }

  async requestOtp(): Promise<void> {
    if (this.state.phase === 'authenticated') return;
    if (!this.begin('request')) return;

    const wasOpen = this.state.phase;
    const mobile = normalizeIranianMobile(this.state.mobile);
    if (!mobile) {
      this.end('request');
      this.patch({ error: 'شماره موبایل معتبر وارد کنید.', phase: wasOpen === 'idle' ? 'mobile' : wasOpen });
      return;
    }

    try {
      const generation = this.generation;
      const challenge = await this.api.requestOtp({ mobile, client: 'CUSTOMER_WEB' });
      if (generation !== this.generation) return; // superseded by logout/reset
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
    if (!this.begin('verify')) return;

    const code = this.state.code;
    if (!isValidOtpCode(code)) {
      this.end('verify');
      this.patch({ error: 'کد باید ۶ رقم باشد.' });
      return;
    }

    try {
      const generation = this.generation;
      const challengeId = this.state.challenge.challengeId;
      const result = await this.api.verifyOtp({ challengeId, code });
      if (generation !== this.generation) return; // superseded by logout/reset
      this.patch({
        phase: 'authenticated',
        principal: result.principal,
        challenge: null,
        expiresAt: null,
        code: '',
        error: null,
      });
    } catch (error) {
      this.patch({ error: farsiError(error, this.state.mobile) });
    } finally {
      this.end('verify');
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
      this.patch({ ...initialState, busy: true });
      this.end('logout');
    }
  }
}

export { initialState as initialCustomerOtpState };
