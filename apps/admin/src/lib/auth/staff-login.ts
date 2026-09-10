import type { AuthPrincipal } from './staff-types';
import { TOTP_CODE_PATTERN } from './staff-types';
import type { StaffAuthApi, StaffTokenStore } from './staff-api';
import { StaffAuthError } from './staff-api';

/**
 * Staff login flow controller (admin login slice, #50).
 *
 * React-agnostic: owns the password -> TOTP state machine, validation, error
 * mapping and session recovery, exposing an immutable snapshot + subscribe so
 * the UI can render with `useSyncExternalStore`. Business/Auth logic stays out
 * of components (AGENTS.md). Access/challenge state is memory-only.
 */

export type StaffLoginPhase =
  | 'idle' // closed
  | 'password' // awaiting identifier + password
  | 'totp' // challenge active, awaiting the 6-digit TOTP code
  | 'authenticated'
  | 'session-expired' // me() showed an invalid/rotated session
  | 'forbidden'; // me() showed revoked access

export type StaffLoginUiState = {
  phase: StaffLoginPhase;
  identifier: string;
  password: string;
  code: string;
  busy: boolean;
  error: string | null;
  /** Challenge token for the active TOTP step; null otherwise. */
  challengeToken: string | null;
  /** Challenge expires at this epoch (ms); null when none is active. */
  expiresAt: number | null;
  /** Rate-limit back-off: submits are locked until this epoch (ms). */
  rateLimitNotBefore: number;
  principal: AuthPrincipal | null;
};

const initialState: StaffLoginUiState = {
  phase: 'idle',
  identifier: '',
  password: '',
  code: '',
  busy: false,
  error: null,
  challengeToken: null,
  expiresAt: null,
  rateLimitNotBefore: 0,
  principal: null,
};

function isStaffAuthError(error: unknown): error is StaffAuthError {
  return error instanceof StaffAuthError;
}

/** Map any thrown error to a Farsi user-facing message. */
function farsiError(error: unknown): string {
  if (isStaffAuthError(error)) {
    switch (error.code) {
      case 'AUTH_INVALID_CREDENTIALS':
        return 'شناسه یا رمز عبور نادرست است.';
      case 'AUTH_CHALLENGE_INVALID':
        return 'کد تایید نادرست است.';
      case 'AUTH_CHALLENGE_EXPIRED':
        return 'کد تایید منقضی شده است. دوباره تلاش کنید.';
      case 'AUTH_SESSION_INVALID':
      case 'AUTH_SESSION_REPLAYED':
      case 'AUTH_REAUTHENTICATION_REQUIRED':
        return 'نشست شما به پایان رسیده است. دوباره وارد شوید.';
      case 'FORBIDDEN':
        return 'دسترسی به پنل عملیات مجاز نیست.';
      case 'RATE_LIMITED':
        return 'تلاش‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.';
      case 'VALIDATION_ERROR':
        return 'کد تایید باید ۶ رقم باشد.';
      case 'AUTH_CSRF_INVALID':
      case 'UPSTREAM_UNAVAILABLE':
      case 'INTERNAL_ERROR':
        return 'سرور در دسترس نیست. چند دقیقه دیگر تلاش کنید.';
      case 'AUTH_PASSWORD_POLICY':
        return 'رمز عبور با سیاست امنیتی همخوانی ندارد.';
      default:
        return 'ورود انجام نشد. دوباره تلاش کنید.';
    }
  }
  return 'خطای ناشناخته؛ دوباره تلاش کنید.';
}

/**
 * A `StaffLoginController` instance is a tiny subscribable store. The UI reads
 * `getState()` and subscribes via `subscribe()` (useSyncExternalStore).
 */
export class StaffLoginController {
  private state: StaffLoginUiState = initialState;
  private readonly listeners = new Set<() => void>();
  private readonly api: StaffAuthApi;
  private readonly tokenStore: StaffTokenStore;
  private readonly inflight = new Set<string>();
  /** Generation guard: bumped on close/logout/reset to discard stale async results. */
  private generation = 0;

  constructor(
    api: StaffAuthApi,
    tokenStore: StaffTokenStore,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.api = api;
    this.tokenStore = tokenStore;
  }

  getState(): StaffLoginUiState {
    return this.state;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private patch(partial: Partial<StaffLoginUiState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
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
    const phase: StaffLoginPhase = this.state.principal ? 'authenticated' : 'password';
    this.patch({ phase, error: null });
  }

  close(): void {
    if (this.state.phase === 'authenticated') return;
    this.generation += 1;
    this.patch({
      phase: 'idle',
      password: '',
      code: '',
      error: null,
      challengeToken: null,
      expiresAt: null,
    });
  }

  setIdentifier(identifier: string): void {
    this.patch({ identifier, error: null });
  }

  setPassword(password: string): void {
    this.patch({ password, error: null });
  }

  setCode(code: string): void {
    this.patch({ code: code.replace(/[^0-9]/g, '').slice(0, 6), error: null });
  }

  async submitPassword(): Promise<void> {
    if (this.state.phase === 'authenticated') return;
    if (this.isRateLimited()) {
      this.patch({ error: 'تلاش‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.' });
      return;
    }
    if (!this.begin('password')) return;

    const identifier = this.state.identifier.trim();
    const password = this.state.password;
    if (!identifier || !password) {
      this.end('password');
      this.patch({ error: 'شناسه و رمز عبور را وارد کنید.' });
      return;
    }

    const generation = this.generation;
    try {
      const challenge = await this.api.passwordRequest({ identifier, password });
      if (generation !== this.generation) return;
      this.patch({
        phase: 'totp',
        code: '',
        password: '',
        error: null,
        challengeToken: challenge.challengeToken,
        expiresAt: this.now() + challenge.expiresInSeconds * 1000,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      this.applyRateLimit(error);
      this.patch({ error: farsiError(error) });
    } finally {
      this.end('password');
    }
  }

  async submitTotp(): Promise<void> {
    if (this.state.phase !== 'totp') return;
    if (this.isRateLimited()) {
      this.patch({ error: 'تلاش‌های زیادی ثبت شده است. کمی بعد دوباره تلاش کنید.' });
      return;
    }
    if (!this.begin('totp')) return;

    const code = this.state.code;
    if (!TOTP_CODE_PATTERN.test(code)) {
      this.end('totp');
      this.patch({ error: 'کد تایید باید ۶ رقم باشد.' });
      return;
    }

    // The challenge token travels in controller memory only; the fixture and
    // the real client both accept it on `totpVerify`.
    const generation = this.generation;
    try {
      const challengeToken = this.state.challengeToken;
      if (!challengeToken) {
        this.resetToPassword('نشست تایید نامعتبر است. دوباره وارد شوید.');
        return;
      }
      const result = await this.api.totpVerify({ challengeToken, code });
      if (generation !== this.generation) return;
      this.tokenStore.set(result.accessToken);
      this.patch({
        phase: 'authenticated',
        principal: result.principal,
        code: '',
        error: null,
        challengeToken: null,
        expiresAt: null,
      });
    } catch (error) {
      if (generation !== this.generation) return;
      if (isStaffAuthError(error) && error.code === 'AUTH_CHALLENGE_EXPIRED') {
        this.resetToPassword('کد تایید منقضی شده است. دوباره وارد شوید.');
        return;
      }
      this.applyRateLimit(error);
      this.patch({ error: farsiError(error) });
    } finally {
      this.end('totp');
    }
  }

  /** Verify the current session is still valid; recovers expiry/revoked states. */
  async refreshSession(): Promise<void> {
    if (this.state.phase !== 'authenticated') return;
    if (!this.begin('refresh')) return;
    const generation = this.generation;
    try {
      const principal = await this.api.me();
      if (generation === this.generation) this.patch({ principal });
    } catch (error) {
      if (generation !== this.generation) return;
      const expired = isStaffAuthError(error) && (
        error.code === 'AUTH_SESSION_INVALID'
        || error.code === 'AUTH_SESSION_REPLAYED'
        || error.code === 'AUTH_REAUTHENTICATION_REQUIRED'
        || error.code === 'AUTH_CSRF_INVALID'
      );
      this.patch({
        phase: isStaffAuthError(error) && error.code === 'FORBIDDEN' ? 'forbidden' : 'session-expired',
        error: expired ? 'نشست شما به پایان رسیده است. دوباره وارد شوید.' : farsiError(error),
        principal: null,
      });
      this.tokenStore.set(null);
    } finally {
      this.end('refresh');
    }
  }

  /** Back to the password step; the consumed/expired challenge is discarded. */
  resetToPassword(error: string | null = null): void {
    if (this.state.phase === 'authenticated') return;
    this.generation += 1;
    this.patch({
      phase: 'password',
      password: '',
      code: '',
      error,
      challengeToken: null,
      expiresAt: null,
    });
  }

  async logout(): Promise<void> {
    if (!this.begin('logout')) return;
    try {
      await this.api.logout();
    } catch {
      // Best-effort; the local in-memory token is cleared regardless.
    } finally {
      this.tokenStore.set(null);
      this.generation += 1;
      this.patch({ ...initialState, busy: true });
      this.end('logout');
    }
  }

  private isRateLimited(): boolean {
    return this.now() < this.state.rateLimitNotBefore;
  }

  private applyRateLimit(error: unknown): void {
    if (isStaffAuthError(error) && error.code === 'RATE_LIMITED') {
      const waitSeconds = error.retryAfterSeconds ?? 30;
      this.patch({ rateLimitNotBefore: this.now() + waitSeconds * 1000 });
    }
  }
}

export { initialState as initialStaffLoginState };