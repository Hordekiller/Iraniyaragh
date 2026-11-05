import { randomBytes, randomUUID } from 'node:crypto';
import { AuthenticationLevel, UserStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { AuthSessionException, AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthPrincipalService } from './auth-principal.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-auth-refresh-reliability',
  audience: 'iranyaragh-browser',
  accessTokenTtlSeconds: 600,
  clockToleranceSeconds: 30,
  currentHashKey: Object.freeze({
    version: 2,
    secret: 'integration-current-hash-secret-32-bytes-minimum',
  }),
  previousHashKey: Object.freeze({
    version: 1,
    secret: 'integration-previous-hash-secret-32-bytes-minimum',
  }),
  cookies: Object.freeze({
    refreshName: '__Host-iranyaragh_refresh',
    csrfName: '__Host-iranyaragh_csrf',
    secure: true,
    sameSite: 'strict',
    path: '/',
  }),
});

describe.sequential('refresh recovery database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const customerId = `recov_customer_${runId}`;
  const staffId = `recov_staff_${runId}`;
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const tokens = new AuthTokenService(runtimeConfig);
  const sessions = new AuthSessionService(prisma, hashes, tokens);
  const principals = new AuthPrincipalService(prisma, tokens, new AuthPermissionService(prisma));
  let connected = false;

  const login = (userId: string, level: AuthenticationLevel) =>
    sessions.createSession({ userId, authenticationLevel: level, authenticatedAt: new Date(Date.now() - 1_000) });
  const bearer = (token: string) => `Bearer ${token}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    for (const id of [customerId, staffId]) {
      await prisma.user.create({ data: { id, email: `${id}@example.com`, status: UserStatus.ACTIVE } });
    }
  });

  afterAll(async () => {
    if (!connected) return;
    const ids = [customerId, staffId];
    await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const attempt = () => randomBytes(16).toString('base64url');
  const staff = AuthenticationLevel.STAFF_MFA;
  const customer = AuthenticationLevel.CUSTOMER_OTP;
  const rows = (sessionId: string) => prisma.refreshRecovery.count({ where: { previousSessionId: sessionId } });

  it('recovers the committed rotation for a retry of the same attempt, without creating a second branch', async () => {
    const first = await login(customerId, customer);
    const id = attempt();
    const committed = await sessions.rotateSession(first.refreshToken, customer, id); // response "lost"
    const retried = await sessions.rotateSession(first.refreshToken, customer, id);
    const again = await sessions.rotateSession(first.refreshToken, customer, id);

    for (const r of [retried, again]) {
      expect(r.refreshToken).toBe(committed.refreshToken);
      expect(r.csrfToken).toBe(committed.csrfToken);
      expect(r.sessionId).toBe(committed.sessionId);
    }
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId } })).toBe(2);
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } })).toBe(1);
    // The recovered pair really works: it rotates, and its access token resolves.
    await expect(principals.resolveBearerToken(bearer(retried.accessToken))).resolves.toMatchObject({ sessionId: committed.sessionId });
    await expect(sessions.rotateSession(retried.refreshToken, customer, attempt())).resolves.toMatchObject({ tokenFamilyId: first.tokenFamilyId });
    await sessions.revokeAllSessions(customerId);
  });

  it('serves concurrent same-attempt retries one identical outcome', async () => {
    const first = await login(staffId, staff);
    const id = attempt();
    const committed = await sessions.rotateSession(first.refreshToken, staff, id);
    const results = await Promise.all(Array.from({ length: 6 }, () => sessions.rotateSession(first.refreshToken, staff, id)));
    expect(new Set(results.map(r => r.refreshToken))).toEqual(new Set([committed.refreshToken]));
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'auth.session.replay_detected', actorId: staffId } })).toBe(0);
    await sessions.revokeAllSessions(staffId);
  });

  it('treats a retry after the window as replay and revokes the family', async () => {
    const first = await login(customerId, customer);
    const id = attempt();
    await sessions.rotateSession(first.refreshToken, customer, id);
    await prisma.refreshRecovery.update({ where: { previousSessionId: first.sessionId }, data: { createdAt: new Date(Date.now() - 20_000), expiresAt: new Date(Date.now() - 5_000) } });
    await expect(sessions.rotateSession(first.refreshToken, customer, id)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_REPLAYED' });
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } })).toBe(0);
  });

  it('never gives a successor to a different, missing or malformed attempt, and revokes the family', async () => {
    for (const probe of [attempt(), undefined]) {
      const first = await login(customerId, customer);
      await sessions.rotateSession(first.refreshToken, customer, attempt());
      await expect(sessions.rotateSession(first.refreshToken, customer, probe)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_REPLAYED' });
      expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } })).toBe(0);
    }
  });

  it('does not open recovery material with the right attempt but a different previous token', async () => {
    // Tampered/foreign record: sealed under another key -> unreadable -> replay path.
    const a = await login(customerId, customer);
    const b = await login(customerId, customer);
    const id = attempt();
    await sessions.rotateSession(a.refreshToken, customer, id);
    await sessions.rotateSession(b.refreshToken, customer, id);
    const foreign = await prisma.refreshRecovery.findUniqueOrThrow({ where: { previousSessionId: b.sessionId } });
    await prisma.refreshRecovery.update({ where: { previousSessionId: a.sessionId }, data: { sealed: foreign.sealed } });
    await expect(sessions.rotateSession(a.refreshToken, customer, id)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_REPLAYED' });
    await sessions.revokeAllSessions(customerId);
  });

  it('is impossible after logout, revocation, credential change or expiry of the successor', async () => {
    const cases: Array<[string, (login: Awaited<ReturnType<typeof sessions.createSession>>, next: Awaited<ReturnType<typeof sessions.rotateSession>>) => Promise<void>]> = [
      ['logout', async (_l, next) => { await sessions.revokeByRefreshToken(next.refreshToken); }],
      ['revoke all', async () => { await sessions.revokeAllSessions(staffId); }],
      ['credential change', async (l) => {
        await sessions.rotateSessionAfterCredentialChange({ userId: staffId, currentSessionId: (await prisma.session.findFirstOrThrow({ where: { tokenFamilyId: l.tokenFamilyId, revokedAt: null } })).id, passwordHash: `argon2-fake-${randomUUID()}`, passwordChangedAt: new Date() });
      }],
      ['absolute expiry', async (l) => {
        await prisma.session.updateMany({ where: { tokenFamilyId: l.tokenFamilyId, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1_000), authenticatedAt: new Date(Date.now() - 9_000), createdAt: new Date(Date.now() - 8_000), lastUsedAt: new Date(Date.now() - 8_000) } });
      }],
      ['inactivity', async (l) => {
        await prisma.session.updateMany({ where: { tokenFamilyId: l.tokenFamilyId, revokedAt: null }, data: { authenticatedAt: new Date(Date.now() - 33 * 60_000), createdAt: new Date(Date.now() - 32 * 60_000), lastUsedAt: new Date(Date.now() - 31 * 60_000) } });
      }],
    ];
    for (const [name, act] of cases) {
      const first = await login(staffId, staff);
      const id = attempt();
      const next = await sessions.rotateSession(first.refreshToken, staff, id);
      await act(first, next);
      await expect(sessions.rotateSession(first.refreshToken, staff, id), name).rejects.toBeInstanceOf(AuthSessionException);
      expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } }), name).toBe(0);
      await sessions.revokeAllSessions(staffId);
    }
  });

  it('logout with the previous (rotated) token ends the whole login and blocks recovery', async () => {
    const first = await login(staffId, staff);
    const id = attempt();
    await sessions.rotateSession(first.refreshToken, staff, id);   // response lost: browser only has first.refreshToken
    expect(await sessions.revokeByRefreshToken(first.refreshToken)).toBe(true);
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId, revokedAt: null } })).toBe(0);
    await expect(sessions.rotateSession(first.refreshToken, staff, id)).rejects.toBeInstanceOf(AuthSessionException);
    expect(await sessions.revokeByRefreshToken(first.refreshToken)).toBe(false); // idempotent
  });

  it('keeps the two realms independent and never recovers across realms', async () => {
    const s = await login(staffId, staff);
    const c = await login(customerId, customer);
    const sid = attempt();
    const cid = attempt();
    const sNext = await sessions.rotateSession(s.refreshToken, staff, sid);
    const cNext = await sessions.rotateSession(c.refreshToken, customer, cid);
    // Wrong realm presenting the right token+attempt: invalid, nothing revoked.
    await expect(sessions.rotateSession(s.refreshToken, customer, sid)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    await expect(sessions.rotateSession(c.refreshToken, staff, cid)).rejects.toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    await expect(sessions.rotateSession(s.refreshToken, staff, sid)).resolves.toMatchObject({ refreshToken: sNext.refreshToken });
    await expect(sessions.rotateSession(c.refreshToken, customer, cid)).resolves.toMatchObject({ refreshToken: cNext.refreshToken });
    await sessions.revokeAllSessions(staffId);
    await sessions.revokeAllSessions(customerId);
  });

  it('stores no plaintext credential and cleans expired rows', async () => {
    const first = await login(customerId, customer);
    const next = await sessions.rotateSession(first.refreshToken, customer, attempt());
    const row = await prisma.refreshRecovery.findUniqueOrThrow({ where: { previousSessionId: first.sessionId } });
    const dump = JSON.stringify(row);
    for (const secret of [first.refreshToken, next.refreshToken, next.csrfToken, next.accessToken]) expect(dump).not.toContain(secret);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(15_000);
    await prisma.refreshRecovery.update({ where: { previousSessionId: first.sessionId }, data: { createdAt: new Date(Date.now() - 20_000), expiresAt: new Date(Date.now() - 5_000) } });
    expect(await sessions.purgeExpiredRecoveries()).toBeGreaterThanOrEqual(1);
    expect(await rows(first.sessionId)).toBe(0);
    await sessions.revokeAllSessions(customerId);
  });

  it('commits rotation and recovery record atomically: a failing record write rolls the rotation back', async () => {
    const first = await login(customerId, customer);
    // Real storage failure: a trigger makes the recovery insert fail inside the rotation transaction.
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION recov_fail() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated recovery storage failure'; END $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER recov_fail_trg BEFORE INSERT ON "RefreshRecovery" FOR EACH ROW EXECUTE FUNCTION recov_fail()`);
    try {
      await expect(sessions.rotateSession(first.refreshToken, customer, attempt())).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER recov_fail_trg ON "RefreshRecovery"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION recov_fail()`);
    }
    // Nothing committed: the old token is still the live head and rotates normally.
    expect(await prisma.session.count({ where: { tokenFamilyId: first.tokenFamilyId } })).toBe(1);
    await expect(sessions.rotateSession(first.refreshToken, customer, attempt())).resolves.toMatchObject({ tokenFamilyId: first.tokenFamilyId });
    await sessions.revokeAllSessions(customerId);
  });
});
