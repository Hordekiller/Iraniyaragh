import { UserStatus, type Session } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthSessionException } from './auth-session.service';
import { type AuthTokenService, type VerifiedAccessToken } from './auth-token.service';
import { AuthPrincipalService } from './auth-principal.service';

type SessionRow = Pick<
  Session,
  'authenticationLevel' | 'authenticatedAt' | 'createdAt' | 'expiresAt' | 'lastUsedAt' | 'revokedAt'
> & {
  user: { status: UserStatus };
};

function nowIso(deltaMs: number): Date {
  return new Date(Date.now() + deltaMs);
}

function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    authenticationLevel: 'STAFF_MFA',
    authenticatedAt: nowIso(-60_000),
    createdAt: nowIso(-60_000),
    expiresAt: nowIso(12 * 60 * 60 * 1_000),
    lastUsedAt: nowIso(-60_000),
    revokedAt: null,
    user: { status: UserStatus.ACTIVE },
    ...overrides,
  };
}

function makeToken(overrides: Partial<VerifiedAccessToken> = {}): VerifiedAccessToken {
  return {
    userId: 'user-1',
    sessionId: 'session-1',
    tokenId: 'jti-1',
    authenticationLevel: 'STAFF_MFA',
    authenticationMethods: ['pwd', 'totp'],
    authenticatedAtSeconds: Math.floor((Date.now() - 60_000) / 1_000),
    issuedAtSeconds: Math.floor(Date.now() / 1_000),
    expiresAtSeconds: Math.floor((Date.now() + 600_000) / 1_000),
    ...overrides,
  };
}

function createService(options: {
  session: SessionRow | null;
  token: VerifiedAccessToken | null;
  permissions?: ReadonlySet<string>;
}): {
  service: AuthPrincipalService;
  findFirst: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
  effective: ReturnType<typeof vi.fn>;
} {
  const findFirst = vi.fn().mockResolvedValue(options.session);
  const verify = vi.fn().mockImplementation(() => {
    if (!options.token) throw new Error('invalid token');
    return options.token;
  });
  const effective = vi.fn().mockResolvedValue(options.permissions ?? new Set<string>());
  const prisma = { session: { findFirst } } as unknown as PrismaService;
  const tokens = { verifyAccessToken: verify } as unknown as AuthTokenService;
  const permissions = { effectivePermissionKeys: effective } as unknown as AuthPermissionService;
  return { service: new AuthPrincipalService(prisma, tokens, permissions), findFirst, verify, effective };
}

async function expectInvalid(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
    throw new Error('Expected AUTH_SESSION_INVALID.');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthSessionException);
    expect(error).toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    expect((error as AuthSessionException).getStatus()).toBe(401);
  }
}

describe('AuthPrincipalService.resolveBearerToken', () => {
  it('rejects missing or malformed authorization headers without touching the database', async () => {
    const { service, findFirst, verify } = createService({ session: null, token: null });

    await expectInvalid(service.resolveBearerToken(undefined));
    await expectInvalid(service.resolveBearerToken(''));
    await expectInvalid(service.resolveBearerToken('Basic abc='));
    await expectInvalid(service.resolveBearerToken('Bearer'));
    await expectInvalid(service.resolveBearerToken('Bearer not-valid-token!'));

    expect(verify).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects tokens that fail cryptographic verification', async () => {
    const { service, verify, findFirst } = createService({ session: null, token: null });

    await expectInvalid(service.resolveBearerToken('Bearer eyJhbGciOiJIUzI1NiJ9.e30.invalid'));

    expect(verify).toHaveBeenCalledTimes(1);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rejects unknown, revoked, or non-active-user sessions', async () => {
    const { service, findFirst } = createService({ session: null, token: makeToken() });
    await expectInvalid(service.resolveBearerToken('Bearer valid-token'));
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'session-1', userId: 'user-1', revokedAt: null },
      }),
    );

    const suspended = createService({
      session: makeSession({ user: { status: UserStatus.SUSPENDED } }),
      token: makeToken(),
    });
    await expectInvalid(suspended.service.resolveBearerToken('Bearer valid-token'));

    const revoked = createService({
      session: makeSession({ revokedAt: nowIso(-1_000) }),
      token: makeToken(),
    });
    await expectInvalid(revoked.service.resolveBearerToken('Bearer valid-token'));
  });

  it('rejects sessions past absolute expiry or inactivity deadline', async () => {
    const expired = createService({
      session: makeSession({ expiresAt: nowIso(-1_000) }),
      token: makeToken(),
    });
    await expectInvalid(expired.service.resolveBearerToken('Bearer valid-token'));

    const staffInactive = createService({
      session: makeSession({ lastUsedAt: nowIso(-31 * 60 * 1_000) }),
      token: makeToken({ authenticationLevel: 'STAFF_MFA' }),
    });
    await expectInvalid(staffInactive.service.resolveBearerToken('Bearer valid-token'));

    const customerActive = createService({
      session: makeSession({
        authenticationLevel: 'CUSTOMER_OTP',
        lastUsedAt: nowIso(-2 * 24 * 60 * 60 * 1_000),
      }),
      token: makeToken({ authenticationLevel: 'CUSTOMER_OTP', authenticationMethods: ['sms'] }),
    });
    const principal = await customerActive.service.resolveBearerToken('Bearer valid-token');
    expect(principal.authenticationLevel).toBe('CUSTOMER_OTP');
  });

  it('builds a correct principal using the live session and verified claims', async () => {
    const { service, findFirst } = createService({
      session: makeSession({ lastUsedAt: nowIso(-90_000) }),
      token: makeToken(),
    });

    const principal = await service.resolveBearerToken('Bearer valid-token');

    expect(principal).toMatchObject({
      userId: 'user-1',
      sessionId: 'session-1',
      tokenId: 'jti-1',
      authenticationLevel: 'STAFF_MFA',
    });
    expect(principal.permissions).toEqual(new Set<string>());
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('resolves effective permissions only for STAFF_MFA principals', async () => {
    const staff = createService({
      session: makeSession(),
      token: makeToken(),
      permissions: new Set(['catalog.write', 'reports.read']),
    });

    const staffPrincipal = await staff.service.resolveBearerToken('Bearer valid-token');
    expect(staffPrincipal.permissions).toEqual(new Set(['catalog.write', 'reports.read']));
    expect(staff.effective).toHaveBeenCalledWith('user-1', expect.any(Date));

    const customer = createService({
      session: makeSession({ authenticationLevel: 'CUSTOMER_OTP' }),
      token: makeToken({ authenticationLevel: 'CUSTOMER_OTP', authenticationMethods: ['sms'] }),
    });

    const customerPrincipal = await customer.service.resolveBearerToken('Bearer valid-token');
    expect(customerPrincipal.permissions).toEqual(new Set<string>());
    expect(customer.effective).not.toHaveBeenCalled();
  });

  it('fails closed when the JWT authentication level does not match the live session', async () => {
    const { service } = createService({
      session: makeSession({ authenticationLevel: 'CUSTOMER_OTP' }),
      token: makeToken({ authenticationLevel: 'STAFF_MFA' }),
    });

    await expectInvalid(service.resolveBearerToken('Bearer valid-token'));
  });

  it('fails closed when the JWT auth_time does not match the persisted authenticatedAt', async () => {
    const mismatchedAuthTime = createService({
      session: makeSession({ authenticatedAt: nowIso(-60_000) }),
      token: makeToken({ authenticatedAtSeconds: Math.floor((Date.now() - 120_000) / 1_000) }),
    });
    await expectInvalid(mismatchedAuthTime.service.resolveBearerToken('Bearer valid-token'));

    const matchingAuthTime = createService({
      session: makeSession({ authenticatedAt: nowIso(-60_000) }),
      token: makeToken({ authenticatedAtSeconds: Math.floor((Date.now() - 60_000) / 1_000) }),
    });
    const principal = await matchingAuthTime.service.resolveBearerToken('Bearer valid-token');
    expect(principal.authenticationLevel).toBe('STAFF_MFA');
  });

  it('keeps matching JWT/session evidence out of the success path untouched', async () => {
    const { service } = createService({
      session: makeSession({ authenticationLevel: 'CUSTOMER_OTP' }),
      token: makeToken({ authenticationLevel: 'CUSTOMER_OTP', authenticationMethods: ['sms'] }),
    });

    const principal = await service.resolveBearerToken('Bearer valid-token');
    expect(principal.authenticationLevel).toBe('CUSTOMER_OTP');
    expect(principal.permissions).toEqual(new Set<string>());
  });

  it('rejects sessions in the future whose authentication evidence is invalid', async () => {
    const { service } = createService({
      session: makeSession({ authenticatedAt: nowIso(5_000) }),
      token: makeToken(),
    });

    await expectInvalid(service.resolveBearerToken('Bearer valid-token'));
  });
});