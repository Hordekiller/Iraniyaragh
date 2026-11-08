import { beforeEach, describe, expect, it } from 'vitest';
import { REFRESH_ATTEMPT_CLIENT_WINDOW_MS, createRefreshAttemptStore, type RefreshAttemptRealm } from '@iranyaragh/contracts';

const wire = /^[A-Za-z0-9_-]{22,64}$/;

describe.each<RefreshAttemptRealm>(['customer', 'staff'])('%s refresh attempt identity', realm => {
  const store = createRefreshAttemptStore(realm);
  beforeEach(() => localStorage.clear());

  it('is random, well-formed, and reused only inside the window', () => {
    const first = store.current(1_000);
    expect(first).toMatch(wire);
    expect(store.current(1_000 + REFRESH_ATTEMPT_CLIENT_WINDOW_MS - 1)).toBe(first);
    const second = store.current(1_000 + REFRESH_ATTEMPT_CLIENT_WINDOW_MS);
    expect(second).not.toBe(first);
    expect(second).toMatch(wire);
  });

  it('keeps the attempt after a transport failure and retries the same id', async () => {
    const seen: string[] = [];
    await expect(store.run(async id => { seen.push(id); throw new Error('network'); }, () => true)).rejects.toThrow('network');
    await expect(store.run(async id => { seen.push(id); return 'ok'; }, () => true)).resolves.toBe('ok');
    expect(seen[1]).toBe(seen[0]);
    expect(localStorage.getItem(store.key)).toBeNull();
  });

  it('finishes the attempt on a definitive failure and never loops', async () => {
    const seen: string[] = [];
    await expect(store.run(async id => { seen.push(id); throw new Error('401'); }, () => false)).rejects.toThrow('401');
    expect(localStorage.getItem(store.key)).toBeNull();
    await store.run(async id => { seen.push(id); return 1; }, () => false);
    expect(seen[1]).not.toBe(seen[0]);
  });

  it('stores only the idempotency id and keeps realms separate', () => {
    store.current();
    expect(Object.keys(JSON.parse(localStorage.getItem(store.key)!)).sort()).toEqual(['at', 'id']);
    expect(Object.keys(localStorage)).toEqual([`iranyaragh:refresh-attempt:${realm}`]);
    store.clear();
    expect(localStorage.getItem(store.key)).toBeNull();
  });
});
