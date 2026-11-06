import { ApiClientError, apiFetch } from '@/lib/api/client';
import { getAccessToken } from './token-store';

/**
 * Lightweight, throttled activity signal for the 30-minute staff inactivity
 * policy. The server measures inactivity from the last authenticated request
 * or refresh, so an operator typing in a long form (no API calls, access token
 * silently expiring) would be classed as idle. This forwards *genuine input*
 * only: a ping is sent when the user has interacted since the last ping AND at
 * least PING_INTERVAL_MS has passed (shared across tabs via localStorage).
 * An idle tab sends nothing, so idle sessions still expire server-side.
 * The endpoint can neither extend absolute lifetime nor revive a session that
 * is revoked/expired/idle; it just 401s like any other protected call.
 */
export const PING_INTERVAL_MS = 5 * 60_000;
export const CHECK_INTERVAL_MS = 60_000;
export const SHARED_PING_KEY = 'iranyaragh:staff:activity-ping';
const INPUT_EVENTS = ['keydown', 'pointerdown', 'touchstart', 'wheel'] as const;

function readSharedPing(): number {
  try { return Number(globalThis.localStorage?.getItem(SHARED_PING_KEY)) || 0; } catch { return 0; }
}
function writeSharedPing(at: number): void {
  try { globalThis.localStorage?.setItem(SHARED_PING_KEY, String(at)); } catch { /* storage may be unavailable */ }
}

export function startActivityKeepAlive(options: { now?: () => number; send?: () => Promise<unknown> } = {}): () => void {
  const now = options.now ?? Date.now;
  const send = options.send ?? (() => apiFetch<unknown>('/auth/activity', { method: 'POST', token: getAccessToken() ?? undefined }));
  let lastInputAt = 0;
  let lastPingAt = 0;
  let inFlight = false;

  const onInput = () => { lastInputAt = now(); };
  const tick = () => {
    if (inFlight || !getAccessToken()) return;
    const at = now();
    const lastPing = Math.max(lastPingAt, readSharedPing());
    if (lastInputAt <= lastPing || at - lastPing < PING_INTERVAL_MS) return;
    inFlight = true;
    // Claim the slot before the request so sibling tabs do not duplicate it.
    lastPingAt = at;
    writeSharedPing(at);
    send()
      .catch((error: unknown) => {
        // Transient failures retry on the next eligible tick; auth failures
        // are handled by apiFetch's normal recovery/invalidation path.
        if (!(error instanceof ApiClientError)) { lastPingAt = 0; writeSharedPing(0); }
      })
      .finally(() => { inFlight = false; });
  };

  for (const type of INPUT_EVENTS) globalThis.addEventListener?.(type, onInput, { passive: true, capture: true });
  const timer = setInterval(tick, CHECK_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    for (const type of INPUT_EVENTS) globalThis.removeEventListener?.(type, onInput, { capture: true });
  };
}
