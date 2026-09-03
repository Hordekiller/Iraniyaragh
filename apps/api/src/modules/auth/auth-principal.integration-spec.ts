import { randomUUID } from 'node:crypto';
import {
  AuthenticationLevel,
  UserStatus,
  type Permission,
  type Role,
  type User,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { type AuthRuntimeConfig } from './auth.config';
import { AuthHashService } from './auth-hash.service';
import { AuthPermissionService } from './auth-permission.service';
import { AuthPrincipalService, type AuthPrincipalContext } from './auth-principal.service';
import { AuthSessionException, AuthSessionService } from './auth-session.service';
import { AuthTokenService } from './auth-token.service';

const runtimeConfig: AuthRuntimeConfig = Object.freeze({
  accessSigningSecret: 'integration-access-secret-32-bytes-minimum-value',
  issuer: 'iranyaragh-auth-principal-integration',
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
});

describe.sequential('AuthPrincipalService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 16);
  const prisma = new PrismaService();
  const hashes = new AuthHashService(runtimeConfig);
  const tokens = new AuthTokenService(runtimeConfig);
  const sessions = new AuthSessionService(prisma, hashes, tokens);
  const permissions = new AuthPermissionService(prisma);
  const principals = new AuthPrincipalService(prisma, tokens, permissions);

  let connected = false;
  let staffUser: User;
  let customerUser: User;
  let activeRole: Role;
  let grantedPermission: Permission;
  let revokedPermission: Permission;
  let staffIssuedAccessToken = '';
  let staffIssuedTokenId = '';
  let customerIssuedAccessToken = '';
  const sessionIds: string[] = [];

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    staffUser = await prisma.user.create({
      data: {
        id: `principal_staff_${runId}`,
        email: `principal-staff-${runId}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });
    customerUser = await prisma.user.create({
      data: {
        id: `principal_customer_${runId}`,
        email: `principal-customer-${runId}@example.com`,
        status: UserStatus.ACTIVE,
      },
    });

    grantedPermission = await prisma.permission.create({
      data: {
        key: `catalog.read.spec${runId}`,
        name: `catalog.read.spec${runId}`,
        group: 'catalog',
      },
    });
    revokedPermission = await prisma.permission.create({
      data: {
        key: `pricing.write.spec${runId}`,
        name: `pricing.write.spec${runId}`,
        group: 'pricing',
      },
    });
    const inactivePermission = await prisma.permission.create({
      data: {
        key: `reports.read.spec${runId}`,
        name: `reports.read.spec${runId}`,
        group: 'reports',
        isActive: false,
      },
    });

    const inactiveRole = await prisma.role.create({
      data: { key: `inactive_role_${runId}`, name: `inactive_role_${runId}`, isActive: false },
    });

    activeRole = await prisma.role.create({
      data: { key: `active_role_${runId}`, name: `active_role_${runId}` },
    });
    await prisma.rolePermission.createMany({
      data: [
        { roleId: activeRole.id, permissionId: grantedPermission.id },
        {
          roleId: activeRole.id,
          permissionId: revokedPermission.id,
          grantedAt: new Date(Date.now() - 60_000),
          revokedAt: new Date(),
          revokeReason: 'Integration seed: revoked grant.',
        },
        { roleId: activeRole.id, permissionId: inactivePermission.id },
      ],
    });
    await prisma.rolePermission.createMany({
      data: [{ roleId: inactiveRole.id, permissionId: grantedPermission.id }],
    });

    await prisma.userRole.createMany({
      data: [
        { userId: staffUser.id, roleId: activeRole.id },
        { userId: staffUser.id, roleId: inactiveRole.id },
        {
          userId: customerUser.id,
          roleId: activeRole.id,
          assignedAt: new Date(Date.now() - 60_000),
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000),
          revokedAt: new Date(),
          revokeReason: 'Integration seed: revoked assignment.',
        },
      ],
    });

    const staffIssued = await sessions.createSession({
      userId: staffUser.id,
      authenticationLevel: AuthenticationLevel.STAFF_MFA,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    sessionIds.push(staffIssued.sessionId);
    staffIssuedAccessToken = staffIssued.accessToken;
    staffIssuedTokenId = tokens.verifyAccessToken(staffIssued.accessToken).tokenId;

    const customerIssued = await sessions.createSession({
      userId: customerUser.id,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    sessionIds.push(customerIssued.sessionId);
    customerIssuedAccessToken = customerIssued.accessToken;
  });

  afterAll(async () => {
    if (!connected) return;
    const userIds = [staffUser?.id, customerUser?.id].filter((id): id is string => id !== undefined);
    const keys = [
      grantedPermission?.key,
      revokedPermission?.key,
      `reports.read.spec${runId}`,
    ].filter((key): key is string => key !== undefined);
    const roleKeys = [`active_role_${runId}`, `inactive_role_${runId}`];

    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { entityId: { in: userIds } }] },
    });
    await prisma.rolePermission.deleteMany({
      where: { OR: [{ permissionId: { in: [...keys, `reports.read.spec${runId}`] } }, { role: { key: { in: roleKeys } } }] },
    });
    await prisma.role.deleteMany({ where: { key: { in: roleKeys } } });
    await prisma.permission.deleteMany({ where: { key: { in: keys } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('resolves a live STAFF_MFA principal with only effective active permissions', async () => {
    const principal = await principals.resolveBearerToken(`Bearer ${staffIssuedAccessToken}`);

    expect(principal.userId).toBe(staffUser.id);
    expect(principal.sessionId).toBe(sessionIds[0]);
    expect(principal.tokenId).toBe(staffIssuedTokenId);
    expect(principal.authenticationLevel).toBe(AuthenticationLevel.STAFF_MFA);
    expect(principal.accessExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect([...principal.permissions]).toEqual([grantedPermission.key]);
  });

  it('never exposes staff permissions to a CUSTOMER_OTP principal', async () => {
    const principal = await principals.resolveBearerToken(`Bearer ${customerIssuedAccessToken}`);

    expect(principal.userId).toBe(customerUser.id);
    expect(principal.authenticationLevel).toBe(AuthenticationLevel.CUSTOMER_OTP);
    expect([...principal.permissions]).toEqual([]);
  });

  it('does not activate future-dated role assignments or role-permission grants', async () => {
    const futureRole = await prisma.role.create({
      data: { key: `future_role_${runId}`, name: `future_role_${runId}` },
    });
    const futurePermission = await prisma.permission.create({
      data: {
        key: `future.spec${runId}`,
        name: `future.spec${runId}`,
        group: 'future',
      },
    });
    await prisma.rolePermission.create({
      data: {
        roleId: activeRole.id,
        permissionId: futurePermission.id,
        grantedAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    await prisma.userRole.create({
      data: {
        userId: staffUser.id,
        roleId: futureRole.id,
        assignedAt: new Date(Date.now() + 60 * 60 * 1_000),
      },
    });
    await prisma.rolePermission.create({
      data: { roleId: futureRole.id, permissionId: grantedPermission.id },
    });

    const issued = await sessions.createSession({
      userId: staffUser.id,
      authenticationLevel: AuthenticationLevel.STAFF_MFA,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    sessionIds.push(issued.sessionId);

    const principal = await principals.resolveBearerToken(`Bearer ${issued.accessToken}`);

    expect([...principal.permissions].sort()).toEqual([grantedPermission.key]);

    await prisma.userRole.deleteMany({ where: { role: { key: `future_role_${runId}` } } });
    await prisma.rolePermission.deleteMany({ where: { role: { key: `future_role_${runId}` } } });
    await prisma.rolePermission.deleteMany({ where: { permissionId: futurePermission.id } });
    await prisma.role.deleteMany({ where: { key: `future_role_${runId}` } });
    await prisma.permission.deleteMany({ where: { key: `future.spec${runId}` } });
  });

  it('fails closed after the session is revoked', async () => {
    await sessions.revokeSession(staffUser.id, sessionIds[0]);

    await expectPrincipalInvalid(principals.resolveBearerToken(`Bearer ${staffIssuedAccessToken}`));
  });

  it('fails closed when the user lifecycle is not active', async () => {
    const issued = await sessions.createSession({
      userId: customerUser.id,
      authenticationLevel: AuthenticationLevel.CUSTOMER_OTP,
      authenticatedAt: new Date(Date.now() - 1_000),
    });
    sessionIds.push(issued.sessionId);
    await prisma.user.update({ where: { id: customerUser.id }, data: { status: UserStatus.SUSPENDED } });

    await expectPrincipalInvalid(principals.resolveBearerToken(`Bearer ${issued.accessToken}`));
    await prisma.user.update({ where: { id: customerUser.id }, data: { status: UserStatus.ACTIVE } });
  });

  it('rejects malformed or garbage bearer headers with the same envelope', async () => {
    for (const value of [undefined, '', 'Basic x', 'Bearer', 'Bearer abc!', 'Bearer '.padEnd(6000, 'x')]) {
      await expectPrincipalInvalid(principals.resolveBearerToken(value));
    }
  });
});

async function expectPrincipalInvalid(operation: Promise<AuthPrincipalContext>): Promise<void> {
  try {
    await operation;
    throw new Error('Expected AUTH_SESSION_INVALID.');
  } catch (error) {
    expect(error).toBeInstanceOf(AuthSessionException);
    expect(error).toMatchObject({ authCode: 'AUTH_SESSION_INVALID' });
    expect((error as AuthSessionException).getStatus()).toBe(401);
  }
}