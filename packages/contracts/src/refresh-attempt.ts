/**
 * Pending refresh-attempt identity shared by the storefront (customer realm) and
 * the admin (staff realm). See docs/AUTH_CONTRACT.md 8.1.
 *
 * The server commits a refresh rotation on receipt. If the response is lost
 * (reload, cancellation, network drop) the browser still holds the previous
 * cookie. Re-sending the SAME random attempt ID lets the server hand back the
 * already-committed outcome instead of classifying the retry as replay. The ID
 * is an idempotency key only, never a credential, and is kept in localStorage
 * per realm for CLIENT_WINDOW_MS (shorter than the server's 15 s window).
 */
export const REFRESH_ATTEMPT_HEADER_NAME = 'X-Refresh-Attempt';
export const REFRESH_ATTEMPT_CLIENT_WINDOW_MS = 12_000;

export type RefreshAttemptRealm = 'customer' | 'staff';

export function createRefreshAttemptStore(realm: RefreshAttemptRealm) {
  const key = `iranyaragh:refresh-attempt:${realm}`;

  const read = (): { id: string; at: number } | null => {
    try {
      const parsed = JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') as { id?: unknown; at?: unknown } | null;
      return typeof parsed?.id === 'string' && typeof parsed.at === 'number' ? { id: parsed.id, at: parsed.at } : null;
    } catch {
      return null;
    }
  };

  const clear = (): void => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage may be unavailable */
    }
  };

  /** Reuse the pending attempt only while it is younger than the client window. */
  const current = (now: number = Date.now()): string => {
    const stored = read();
    if (stored && stored.at <= now && now - stored.at < REFRESH_ATTEMPT_CLIENT_WINDOW_MS) return stored.id;
    // UUID v4 (122 random bits): 36 chars of [0-9a-f-], accepted by the server format.
    const id = globalThis.crypto.randomUUID();
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify({ id, at: now }));
    } catch {
      /* a retry then simply gets a fresh id */
    }
    return id;
  };

  /**
   * Run one refresh. A definitive HTTP answer (success or 4xx) finishes the
   * attempt; a transport failure or 5xx (`outcomeUnknown`) leaves it pending so
   * the next refresh retries the same attempt - but only until the window ends.
   */
  const run = async <T>(send: (attemptId: string) => Promise<T>, outcomeUnknown: (error: unknown) => boolean): Promise<T> => {
    try {
      const result = await send(current());
      clear();
      return result;
    } catch (error) {
      if (!outcomeUnknown(error)) clear();
      throw error;
    }
  };

  return { key, current, clear, run };
}
