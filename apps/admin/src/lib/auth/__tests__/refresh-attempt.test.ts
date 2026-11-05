import { beforeEach, describe, expect, it } from 'vitest';
import { CLIENT_WINDOW_MS, clearRefreshAttempt, currentRefreshAttempt, runRefreshAttempt } from '../refresh-attempt';

const KEY = 'iranyaragh:refresh-attempt:staff';
const wireFormat = /^[A-Za-z0-9_-]{22,64}$/;

describe('staff refresh attempt identity', () => {
  beforeEach(() => localStorage.clear());

  it('generates a random well-formed id and reuses it only inside the window', () => {
    const first = currentRefreshAttempt(1_000);
    expect(first).toMatch(wireFormat);
    expect(currentRefreshAttempt(1_000 + CLIENT_WINDOW_MS - 1)).toBe(first);
    const second = currentRefreshAttempt(1_000 + CLIENT_WINDOW_MS);
    expect(second).not.toBe(first);
    expect(second).toMatch(wireFormat);
  });

  it('keeps the attempt after a transport failure and retries the same id', async () => {
    const seen: string[] = [];
    const unknown = () => true;
    await expect(runRefreshAttempt(async id => { seen.push(id); throw new Error('network'); }, unknown)).rejects.toThrow('network');
    await expect(runRefreshAttempt(async id => { seen.push(id); return 'ok'; }, unknown)).resolves.toBe('ok');
    expect(seen[1]).toBe(seen[0]);
    expect(localStorage.getItem(KEY)).toBeNull(); // success finishes the attempt
  });

  it('finishes the attempt on a definitive failure and never loops', async () => {
    const seen: string[] = [];
    await expect(runRefreshAttempt(async id => { seen.push(id); throw new Error('401'); }, () => false)).rejects.toThrow('401');
    expect(localStorage.getItem(KEY)).toBeNull();
    await runRefreshAttempt(async id => { seen.push(id); return 1; }, () => false);
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('stores only the idempotency id, never a credential, and clears on demand', () => {
    currentRefreshAttempt();
    const raw = localStorage.getItem(KEY)!;
    expect(Object.keys(JSON.parse(raw)).sort()).toEqual(['at', 'id']);
    clearRefreshAttempt();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
