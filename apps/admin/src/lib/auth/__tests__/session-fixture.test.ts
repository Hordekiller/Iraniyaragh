import { describe, expect, it } from 'vitest';
import { buildSessionFixture, SessionManagementFixture } from '../session-fixture';

describe('buildSessionFixture', () => {
  it('builds a deterministic three-session baseline with the current session flagged', () => {
    const now = 1_700_000_000_000;
    const sessions = buildSessionFixture({ now: () => now });
    expect(sessions).toHaveLength(3);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
    expect(sessions.find((s) => s.current)?.sessionId).toBe('fixture-session-current');
    expect(sessions.every((s) => s.authenticationLevel === 'STAFF_MFA')).toBe(true);
  });

  it('honours the current device name option', () => {
    const now = 1_700_000_000_000;
    const sessions = buildSessionFixture({ now: () => now, currentDeviceName: 'کنسول عملیات' });
    expect(sessions.find((s) => s.current)?.deviceName).toBe('کنسول عملیات');
  });

  it('produces timestamps consistent with the injected clock', () => {
    const now = 1_700_000_000_000;
    const sessions = buildSessionFixture({ now: () => now });
    const current = sessions.find((s) => s.current)!;
    expect(new Date(current.createdAt).getTime()).toBeLessThan(now);
    expect(new Date(current.lastUsedAt!).getTime()).toBeLessThan(now);
    expect(new Date(current.expiresAt).getTime()).toBeGreaterThan(now);
  });
});

describe('SessionManagementFixture', () => {
  it('lists a stable copy so callers cannot mutate fixture state', async () => {
    const fixture = SessionManagementFixture.create();
    const first = await fixture.listSessions();
    first.pop();
    expect(await fixture.listSessions()).toHaveLength(3);
  });

  it('revokes a non-current session and leaves the current one', async () => {
    const fixture = SessionManagementFixture.create();
    await fixture.revokeSession('fixture-session-web');
    const sessions = await fixture.listSessions();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.sessionId === 'fixture-session-web')).toBeUndefined();
    expect(sessions.find((s) => s.current)?.sessionId).toBe('fixture-session-current');
  });

  it('revokes the current session', async () => {
    const fixture = SessionManagementFixture.create();
    await fixture.revokeSession('fixture-session-current');
    expect(await fixture.listSessions()).toHaveLength(2);
  });

  it('logout-all empties the session set', async () => {
    const fixture = SessionManagementFixture.create();
    await fixture.logoutAll();
    expect(await fixture.listSessions()).toEqual([]);
  });

  it('from() rebuilds from an explicit session list for pathological scenarios', async () => {
    const fixture = SessionManagementFixture.from([]);
    expect(await fixture.listSessions()).toEqual([]);
  });
});