import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, restoreRetryDelayMs, useAuth } from '../AuthProvider';
import { ApiAbortError, ApiClientError, ApiNetworkError, readCsrfToken, recoverApiSession } from '@/lib/api/client';

vi.mock('@/lib/api/client', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  recoverApiSession: vi.fn(), readCsrfToken: vi.fn(() => 'csrf'),
  registerSessionRecovery: vi.fn(() => () => undefined), registerAuthenticationFailure: vi.fn(() => () => undefined),
}));

const failure = (code: string, statusCode: number, retryAfter?: string) =>
  new ApiClientError({ code, message: code, requestId: 'r', statusCode } as ConstructorParameters<typeof ApiClientError>[0], retryAfter ? new Headers({ 'Retry-After': retryAfter }) : undefined);
function Probe() { const { isRestoring, isAuthenticated } = useAuth(); return <span data-testid="state">{isRestoring ? 'restoring' : isAuthenticated ? 'in' : 'out'}</span>; }
const mount = () => render(<AuthProvider><Probe /></AuthProvider>);
const state = () => screen.getByTestId('state').textContent;
const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('session restore on page load', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.mocked(recoverApiSession).mockReset(); vi.mocked(readCsrfToken).mockReturnValue('csrf'); });
  afterEach(() => { vi.useRealTimers(); });

  it('classifies which failures say nothing about the session', () => {
    expect(restoreRetryDelayMs(failure('RATE_LIMITED', 429, '7'), 0)).toBe(7000);
    expect(restoreRetryDelayMs(failure('RATE_LIMITED', 429, '600'), 0)).toBe(30000);
    expect(restoreRetryDelayMs(failure('RATE_LIMITED', 429), 1)).toBe(5000);
    expect(restoreRetryDelayMs(failure('UPSTREAM_UNAVAILABLE', 502), 0)).toBe(2000);
    expect(restoreRetryDelayMs(new ApiNetworkError('offline'), 2)).toBe(10000);
    // Authoritative answers are final, and the retry budget is bounded.
    for (const final of [failure('AUTH_SESSION_INVALID', 401), failure('AUTH_SESSION_REPLAYED', 401), failure('AUTH_CSRF_INVALID', 403), failure('FORBIDDEN', 403), new ApiAbortError()]) {
      expect(restoreRetryDelayMs(final, 0)).toBeNull();
    }
    expect(restoreRetryDelayMs(new ApiNetworkError('offline'), 4)).toBeNull();
  });

  it('keeps the operator behind the restoring screen through a rate limit instead of dropping to login', async () => {
    vi.mocked(recoverApiSession).mockRejectedValueOnce(failure('RATE_LIMITED', 429, '3')).mockResolvedValueOnce('token');
    mount();
    await advance(0);
    expect(recoverApiSession).toHaveBeenCalledTimes(1);
    expect(state()).toBe('restoring');
    await advance(2999);
    expect(state()).toBe('restoring');
    expect(recoverApiSession).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(recoverApiSession).toHaveBeenCalledTimes(2);
    expect(state()).not.toBe('restoring');
  });

  it('ends restoring at once for an invalid session, with no retry', async () => {
    vi.mocked(recoverApiSession).mockRejectedValue(failure('AUTH_SESSION_INVALID', 401));
    mount();
    await advance(0);
    expect(state()).toBe('out');
    await advance(60000);
    expect(recoverApiSession).toHaveBeenCalledTimes(1);
  });

  it('gives up after a bounded number of attempts when the API stays unreachable', async () => {
    vi.mocked(recoverApiSession).mockRejectedValue(new ApiNetworkError('offline'));
    mount();
    await advance(0);
    expect(state()).toBe('restoring');
    await advance(2000 + 5000 + 10000 + 20000);
    expect(recoverApiSession).toHaveBeenCalledTimes(5);
    expect(state()).toBe('out');
    await advance(120000);
    expect(recoverApiSession).toHaveBeenCalledTimes(5);
  });

  it('stops retrying when the provider unmounts or the session cookie disappears', async () => {
    vi.mocked(recoverApiSession).mockRejectedValue(failure('UPSTREAM_UNAVAILABLE', 503));
    const view = mount();
    await advance(0);
    view.unmount();
    await advance(60000);
    expect(recoverApiSession).toHaveBeenCalledTimes(1);
    vi.mocked(recoverApiSession).mockClear();
    mount();
    await advance(0);
    vi.mocked(readCsrfToken).mockReturnValue(null);
    await advance(2000);
    expect(recoverApiSession).toHaveBeenCalledTimes(2);
    expect(state()).toBe('out');
    await advance(60000);
    expect(recoverApiSession).toHaveBeenCalledTimes(2);
  });
});
