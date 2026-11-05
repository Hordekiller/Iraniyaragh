/**
 * Pending refresh-attempt identity (customer realm).
 *
 * The server commits a refresh rotation on receipt. If the response is lost
 * (reload, cancellation, network drop) the browser still holds the previous
 * cookie. Sending the SAME random attempt ID on the retry lets the server hand
 * back the already-committed outcome instead of classifying the retry as replay.
 * The ID is an idempotency key only - never a credential: it is useless without
 * the previous refresh cookie, CSRF and Origin, and it is kept in localStorage
 * (shared by this origin's tabs, per realm) only for CLIENT_WINDOW_MS, which is
 * shorter than the server's 15 s recovery window.
 */
export const CLIENT_WINDOW_MS = 12_000;
const KEY = 'iranyaragh:refresh-attempt:customer';

type Stored = { id: string; at: number };

function read(): Stored | null {
  try {
    const parsed = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') as Partial<Stored> | null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.at === 'number' ? { id: parsed.id, at: parsed.at } : null;
  } catch { return null; }
}

export function clearRefreshAttempt(): void {
  try { globalThis.localStorage?.removeItem(KEY); } catch { /* storage may be unavailable */ }
}

function newId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reuse the pending attempt only while it is younger than the client window. */
export function currentRefreshAttempt(now: number = Date.now()): string {
  const stored = read();
  if (stored && stored.at <= now && now - stored.at < CLIENT_WINDOW_MS) return stored.id;
  const id = newId();
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify({ id, at: now })); } catch { /* retry just gets a fresh id */ }
  return id;
}

/**
 * Run one refresh. A definitive HTTP answer (success or 4xx) finishes the
 * attempt. A transport failure or 5xx leaves it pending so the next refresh
 * (e.g. after a reload) retries the same attempt - but only until the window ends.
 */
export async function runRefreshAttempt<T>(
  send: (attemptId: string) => Promise<T>,
  outcomeUnknown: (error: unknown) => boolean,
): Promise<T> {
  const id = currentRefreshAttempt();
  try {
    const result = await send(id);
    clearRefreshAttempt();
    return result;
  } catch (error) {
    if (!outcomeUnknown(error)) clearRefreshAttempt();
    throw error;
  }
}
