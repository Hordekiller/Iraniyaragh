import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../token-store';
import { CHECK_INTERVAL_MS, PING_INTERVAL_MS, SHARED_PING_KEY, startActivityKeepAlive } from '../activity-keepalive';

describe('staff activity keep-alive', () => {
  let clock = 1_000_000;
  const now = () => clock;
  const advance = (ms: number) => { clock += ms; vi.advanceTimersByTime(ms); };
  const input = () => window.dispatchEvent(new Event('keydown'));
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_000_000;
    localStorage.clear();
    setAccessToken('token');
  });
  afterEach(() => { stop?.(); vi.useRealTimers(); setAccessToken(null); });

  it('sends nothing while the user is idle', () => {
    const send = vi.fn(async () => undefined);
    stop = startActivityKeepAlive({ now, send });
    advance(60 * 60_000);
    expect(send).not.toHaveBeenCalled();
  });

  it('pings at most once per interval while the user keeps interacting', async () => {
    const send = vi.fn(async () => undefined);
    stop = startActivityKeepAlive({ now, send });
    input();
    advance(PING_INTERVAL_MS + CHECK_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i += 1) { input(); advance(CHECK_INTERVAL_MS); }
    expect(send).toHaveBeenCalledTimes(1);
    input();
    advance(PING_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not ping again without new input after a ping', () => {
    const send = vi.fn(async () => undefined);
    stop = startActivityKeepAlive({ now, send });
    input();
    advance(PING_INTERVAL_MS + CHECK_INTERVAL_MS);
    advance(30 * 60_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('is suppressed when another tab pinged recently and when signed out', () => {
    const send = vi.fn(async () => undefined);
    stop = startActivityKeepAlive({ now, send });
    localStorage.setItem(SHARED_PING_KEY, String(clock));
    input();
    advance(CHECK_INTERVAL_MS * 2);
    expect(send).not.toHaveBeenCalled();
    setAccessToken(null);
    advance(PING_INTERVAL_MS * 2);
    expect(send).not.toHaveBeenCalled();
  });
});
