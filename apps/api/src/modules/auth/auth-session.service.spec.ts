import { UserStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthHashService } from './auth-hash.service';
import {
  AuthSessionException,
  AuthSessionService,
  AUTH_SESSION_REVOKE_REASON,
} from './auth-session.service';
import type { AuthTokenService } from './auth-token.service';
import type { PrismaService } from '../../database/prisma.service';

type MockTx = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  session: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  auditLog: {
    create: ReturnType<typeof vi.fn>;
  };
};

function createTx(overrides: {
  userStatus?: UserStatus;
  session?: Partial<SessionRow>;
} = {}): MockTx {
  const status = overrides.userStatus ?? UserStatus.ACTIVE;
  const sessionRow: SessionRow = {
    id: 'session-1',
    userId: 'user-1',
    refreshTokenHash: 'hash:rt',
    tokenFamilyId: 'tf-1',
    authenticationLevel: 'STAFF_MFA',
    authenticatedAt: new Date(Date.now() - 60_000),
    deviceIdHash: null,
    deviceName: null,
    userAgent: null,
    ipHash: null,
    lastUsedAt: new Date(Date.now() - 5_000),
    expiresAt: new Date(Date.now() + 600_000),
    createdAt: new Date(Date.now() - 60_000),
    revokedAt: null,
    revokeReason: null,
    replacedBySessionId: null,
    user: { status },
    ...overrides.session,
  };
  return {
    user: {
      findUnique: vi.fn(async () => ({ status: overrides.userStatus ?? UserStatus.ACTIVE })),
      update: vi.fn(async () => ({})),
    },
    session: {
      findFirst: vi.fn(async () => sessionRow),
      findUnique: vi.fn(async () => sessionRow),
      create: vi.fn(async () => ({ expiresAt: sessionRow.expiresAt, id: 'session-new', tokenFamilyId: 'tf-1' })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  };
}

type SessionRow = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenFamilyId: string;
  authenticationLevel: 'STAFF_MFA' | 'CUSTOMER_OTP';
  authenticatedAt: Date;
  deviceIdHash: string | null;
  deviceName: string | null;
  userAgent: string | null;
  ipHash: string | null;
  lastUsedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  replacedBySessionId: string | null;
  user: { status: UserStatus };
};

function createService(overrides: {
  tx?: MockTx;
  sessionFind?: ReturnType<typeof vi.fn>;
  hashes?: Pick<AuthHashService, 'hash' | 'candidateHashes'>;
  tokens?: Partial<AuthTokenService>;
} = {}) {
  const tx = overrides.tx ?? createTx();
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(tx)),
    session: {
      findMany: vi.fn(async () => [
        {
          id: 'session-1',
          deviceName: 'Laptop',
          authenticationLevel: 'STAFF_MFA',
          createdAt: new Date(Date.now() - 60_000),
          lastUsedAt: new Date(Date.now() - 5_000),
          expiresAt: new Date(Date.now() + 600_000),
        },
        {
          id: 'session-2',
          deviceName: null,
          authenticationLevel: 'CUSTOMER_OTP',
          createdAt: new Date(Date.now() - 120_000),
          lastUsedAt: null,
          expiresAt: new Date(Date.now() + 300_000),
        },
      ]),
    },
  } as unknown as PrismaService;
  const hashes = overrides.hashes ?? {
    hash: vi.fn((value: string) => `hash:${value}`),
    candidateHashes: vi.fn((value: string) => [`hash:${value}`]),
  };
  const tokens = {
    generateTokenFamilyId: vi.fn(() => 'tf-1'),
    generateRefreshToken: vi.fn(() => 'refresh-token'),
    generateCsrfToken: vi.fn(() => 'csrf-token'),
    signAccessToken: vi.fn(() => 'access-token'),
    ...overrides.tokens,
  } as unknown as AuthTokenService;

  const service = new AuthSessionService(
    prisma,
    hashes as AuthHashService,
    tokens as AuthTokenService,
  );
  return { service, prisma, hashes, tokens, tx };
}



describe('AuthSessionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSession', () => {
    const input = {
      userId: 'user-1',
      authenticationLevel: 'STAFF_MFA' as const,
      authenticatedAt: new Date(Date.now() - 10_000),
    };

    it('creates an active-user session and returns issued credentials', async () => {
      const { service, tx } = createService({ tx: createTx({ userStatus: UserStatus.ACTIVE }) });

      const result = await service.createSession(input);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.csrfToken).toBe('csrf-token');
      expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { status: true } });
      expect(tx.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: expect.any(String),
            refreshTokenHash: 'hash:refresh-token',
            tokenFamilyId: 'tf-1',
          }),
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'auth.session.created' }),
        }),
      );
    });

    it('rejects when the user is not ACTIVE', async () => {
      const { service } = createService({ tx: createTx({ userStatus: UserStatus.SUSPENDED }) });
      await expect(service.createSession(input)).rejects.toBeInstanceOf(AuthSessionException);
    });

    it('rejects future-dated or invalid authenticatedAt timestamps', async () => {
      const { service } = createService({ tx: createTx({ userStatus: UserStatus.ACTIVE }) });
      await expect(
        service.createSession({ ...input, authenticatedAt: new Date(Date.now() + 60_000) }),
      ).rejects.toBeInstanceOf(AuthSessionException);
    });

    it('rejects an unsupported authentication level', async () => {
      const { service } = createService({ tx: createTx({ userStatus: UserStatus.ACTIVE }) });
      await expect(
        service.createSession({ ...input, authenticationLevel: 'UNKNOWN' as never }),
      ).rejects.toBeInstanceOf(AuthSessionException);
    });
  });

  describe('rotateSession', () => {
    it('rotates a valid session into a new replacement', async () => {
      const { service, tx, hashes } = createService({ tx: createTx() });

      const result = await service.rotateSession('refresh-token');

      expect(hashes.candidateHashes).toHaveBeenCalledWith('refresh-token', 'refresh');
      expect(tx.session.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { refreshTokenHash: { in: ['hash:refresh-token'] } } }),
      );
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.accessToken).toBe('access-token');
      expect(tx.session.create).toHaveBeenCalled();
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', replacedBySessionId: null, revokedAt: null },
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.rotated }),
        }),
      );
    });

    it('detects replay of an already-rotated token and revokes the whole family', async () => {
      const tx = createTx({
        session: {
          revokedAt: new Date(),
          revokeReason: AUTH_SESSION_REVOKE_REASON.rotated,
          replacedBySessionId: 'replacement-1',
        },
      });
      const { service } = createService({ tx });

      await expect(service.rotateSession('old-refresh-token')).rejects.toMatchObject({
        authCode: 'AUTH_SESSION_REPLAYED',
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenFamilyId: 'tf-1', revokedAt: null },
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.replayDetected }),
        }),
      );
    });

    it('rejects an invalid refresh token', async () => {
      const { service } = createService({ tx: createTx({ session: { revokedAt: new Date() } }) });
      await expect(service.rotateSession('revoked-refresh-token')).rejects.toMatchObject({
        authCode: 'AUTH_SESSION_INVALID',
      });
    });

    it('rejects an expired session and revokes the family', async () => {
      const tx = createTx({ session: { expiresAt: new Date(Date.now() - 1000) } });
      const { service } = createService({ tx });
      await expect(service.rotateSession('expired-token')).rejects.toMatchObject({
        authCode: 'AUTH_SESSION_INVALID',
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenFamilyId: 'tf-1', revokedAt: null },
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.expired }),
        }),
      );
    });

    it('rejects an inactive user session with USER_INACTIVE', async () => {
      const tx = createTx({ userStatus: UserStatus.LOCKED });
      const { service } = createService({ tx });
      await expect(service.rotateSession('token')).rejects.toMatchObject({
        authCode: 'AUTH_SESSION_INVALID',
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.userInactive }),
        }),
      );
    });

    it('rejects an inactive (idle) session', async () => {
      const tx = createTx({ session: { lastUsedAt: new Date(Date.now() - 2 * 60 * 60 * 1_000) } });
      const { service } = createService({ tx });
      await expect(service.rotateSession('idle-token')).rejects.toMatchObject({
        authCode: 'AUTH_SESSION_INVALID',
      });
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.inactivity }),
        }),
      );
    });
  });

  describe('listSessions', () => {
    it('returns safe session summaries with the current flag', async () => {
      const { service } = createService();

      const result = await service.listSessions('user-1', 'session-2');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(
        expect.objectContaining({ sessionId: 'session-1', current: false, deviceName: 'Laptop' }),
      );
      expect(result[1]).toEqual(expect.objectContaining({ sessionId: 'session-2', current: true }));
    });
  });

  describe('revokeSession', () => {
    it('revokes a matching owned session with an audit row', async () => {
      const { service, tx } = createService();
      const result = await service.revokeSession('user-1', 'session-1');
      expect(result).toBe(true);
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: AUTH_SESSION_REVOKE_REASON.logout },
      });
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('returns false when nothing was revoked', async () => {
      const tx = createTx();
      tx.session.updateMany = vi.fn(async () => ({ count: 0 }));
      const { service } = createService({ tx });
      await expect(service.revokeSession('user-1', 'no-session')).resolves.toBe(false);
    });
  });

  describe('revokeByRefreshToken', () => {
    it('revokes the session matching the refresh token', async () => {
      const { service, tx } = createService();
      const result = await service.revokeByRefreshToken('refresh-token');
      expect(result).toBe(true);
      expect(tx.session.findFirst).toHaveBeenCalled();
      expect(tx.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'session-1', revokedAt: null },
          data: expect.objectContaining({ revokeReason: AUTH_SESSION_REVOKE_REASON.logout }),
        }),
      );
    });

    it('returns false when the refresh token is unknown', async () => {
      const tx = createTx();
      tx.session.findFirst = vi.fn(async () => null);
      const { service } = createService({ tx });
      await expect(service.revokeByRefreshToken('unknown-token')).resolves.toBe(false);
    });
  });

  describe('revokeUserSession', () => {
    it('revokes the caller-owned session with the given reason', async () => {
      const { service, tx } = createService();
      const result = await service.revokeUserSession('user-1', 'session-1');
      expect(result).toBe('revoked');
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'auth.session.revoked', actorId: 'user-1' }),
        }),
      );
    });

    it('reports notFound for a foreign or missing session', async () => {
      const tx = createTx({ session: { userId: 'other-user' } });
      const { service } = createService({ tx });
      await expect(service.revokeUserSession('user-1', 'session-other')).resolves.toBe('notFound');
    });

    it('reports alreadyRevoked for a session that is already revoked', async () => {
      const tx = createTx({ session: { userId: 'user-1', revokedAt: new Date() } });
      const { service } = createService({ tx });
      await expect(service.revokeUserSession('user-1', 'session-1')).resolves.toBe('alreadyRevoked');
    });
  });

  describe('revokeAllSessions', () => {
    it('revokes all sessions for the user and passes through the count', async () => {
      const tx = createTx();
      tx.session.updateMany = vi.fn(async () => ({ count: 3 }));
      const { service } = createService({ tx });
      await expect(service.revokeAllSessions('user-1')).resolves.toBe(3);
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokeReason: AUTH_SESSION_REVOKE_REASON.logoutAll },
      });
    });
  });

  describe('createSession with device metadata', () => {
    it('passes through device id/name, user agent and ip hashes', async () => {
      const tx = createTx({ userStatus: UserStatus.ACTIVE });
      const { service } = createService({ tx });

      await service.createSession({
        userId: 'user-1',
        authenticationLevel: 'CUSTOMER_OTP',
        authenticatedAt: new Date(Date.now() - 10_000),
        deviceId: 'device-1',
        deviceName: '  Galaxy  ',
        ipAddress: '192.0.2.5',
        userAgent: 'Mozilla/5.0',
      });

      const createCall = tx.session.create.mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(createCall.data).toEqual(
        expect.objectContaining({
          deviceIdHash: 'hash:device-1',
          deviceName: 'Galaxy',
          userAgent: 'Mozilla/5.0',
          ipHash: 'hash:192.0.2.5',
        }),
      );
    });

    it('rejects control-character device names', async () => {
      const tx = createTx({ userStatus: UserStatus.ACTIVE });
      const { service } = createService({ tx });

      await expect(
        service.createSession({
          userId: 'user-1',
          authenticationLevel: 'STAFF_MFA',
          authenticatedAt: new Date(Date.now() - 10_000),
          deviceName: 'bad\x01name',
        }),
      ).rejects.toThrow(TypeError);
    });

    it('rejects overlong device names', async () => {
      const tx = createTx({ userStatus: UserStatus.ACTIVE });
      const { service } = createService({ tx });

      await expect(
        service.createSession({
          userId: 'user-1',
          authenticationLevel: 'STAFF_MFA',
          authenticatedAt: new Date(Date.now() - 10_000),
          deviceName: 'x'.repeat(151),
        }),
      ).rejects.toThrow(TypeError);
    });
  });
});