import type { SessionSummary } from '@iranyaragh/contracts';
import type { SessionManagementPort } from './session-port';

/**
 * Deterministic, contract-validated session-management fixture for the admin
 * panel (#50).
 *
 * Models the `SessionManagementController` surface (GET /auth/sessions,
 * DELETE /auth/sessions/:sessionId, POST /auth/logout-all) so the session and
 * devices UI can be built and tested before/without a live backend session.
 * Like the staff-auth fixture it is NOT a security mechanism: state is
 * memory-only, ids are stable, and revocation is a plain in-memory removal.
 *
 * The fixture returns exactly the in-memory session set with the current
 * session flagged via `current: true`; the list is copied on read so callers
 * can never mutate fixture state.
 */
export type SessionFixtureOptions = {
  /** Stable current session device name (defaults to the fixture operator). */
  currentDeviceName?: string;
  /** Deterministic clock; defaults to `Date.now`. */
  now?: () => number;
};

const MINUTE_MS = 60_000;

function atMinutesAgo(now: number, minutesAgo: number): string {
  return new Date(now - minutesAgo * MINUTE_MS).toISOString();
}

/** Builds a fresh, deterministic three-session baseline for one principal. */
export function buildSessionFixture(options: SessionFixtureOptions = {}): SessionSummary[] {
  const now = (options.now ?? (() => Date.now()))();
  const current: SessionSummary = {
    sessionId: 'fixture-session-current',
    current: true,
    deviceName: options.currentDeviceName ?? 'لپ‌تاپ عملیات',
    authenticationLevel: 'STAFF_MFA',
    createdAt: atMinutesAgo(now, 35),
    lastUsedAt: atMinutesAgo(now, 2),
    expiresAt: atMinutesAgo(now, -8 * 60),
  };
  const web: SessionSummary = {
    sessionId: 'fixture-session-web',
    current: false,
    deviceName: 'مرورگر وب (مدیریت)',
    authenticationLevel: 'STAFF_MFA',
    createdAt: atMinutesAgo(now, 26 * 60),
    lastUsedAt: atMinutesAgo(now, 3 * 60),
    expiresAt: atMinutesAgo(now, -2 * 60),
  };
  const mobile: SessionSummary = {
    sessionId: 'fixture-session-mobile',
    current: false,
    deviceName: 'موبایل مدیریت',
    authenticationLevel: 'STAFF_MFA',
    createdAt: atMinutesAgo(now, 4 * 24 * 60),
    lastUsedAt: atMinutesAgo(now, 50 * 60),
    expiresAt: atMinutesAgo(now, 10 * 60),
  };
  return [current, web, mobile];
}

export class SessionManagementFixture implements SessionManagementPort {
  private sessions: SessionSummary[];

  private constructor(sessions: SessionSummary[]) {
    this.sessions = sessions;
  }

  /** Fresh fixture with the deterministic three-session baseline. */
  static create(options: SessionFixtureOptions = {}): SessionManagementFixture {
    return new SessionManagementFixture(buildSessionFixture(options));
  }

  /** Test-only: rebuild from an explicit session list. */
  static from(sessions: SessionSummary[]): SessionManagementFixture {
    return new SessionManagementFixture(sessions);
  }

  private copySessions(): SessionSummary[] {
    return this.sessions.map((session) => ({ ...session }));
  }

  async listSessions(): Promise<SessionSummary[]> {
    return this.copySessions();
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.sessions = this.sessions.filter((session) => session.sessionId !== sessionId);
  }

  async logoutAll(): Promise<void> {
    this.sessions = [];
  }
}