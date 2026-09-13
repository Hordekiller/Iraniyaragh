import 'reflect-metadata';

import { ConflictException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { RbacAdminService } from './rbac-admin.service';

type AnyPrisma = PrismaService | Record<string, unknown>;

const ctx = Object.freeze({ actorUserId: 'actor-1', requestId: 'req-1' });

function permissionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'perm_catalog_read',
    key: 'catalog.read',
    name: 'Read catalog',
    description: null,
    group: 'catalog',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function roleRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'role_1',
    key: 'warehouse-manager',
    name: 'Warehouse Manager',
    description: null,
    isSystem: false,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    permissions: [{ permission: permissionRow({ key: 'inventory.write', id: 'perm_inv' }) }],
    ...overrides,
  };
}

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user_1',
    email: 'staff@example.com',
    mobile: null,
    firstName: 'Staff',
    lastName: 'One',
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    roleAssignments: [],
    ...overrides,
  };
}

function grantRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'userRole_1',
    userId: 'user_1',
    roleId: 'role_1',
    assignedById: 'actor-1',
    assignedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: null,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
    role: { key: 'warehouse-manager', name: 'Warehouse Manager', description: null, isSystem: false },
    user: { firstName: 'Staff', lastName: 'One' },
    ...overrides,
  };
}

function sodRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'sod_1',
    key: 'sod-pricing-write-vs-approve-pricing',
    name: 'Pricing write vs approve',
    description: 'One user may not both write and approve pricing.',
    permissionKeys: ['pricing.write', 'finance.approve.pricing'],
    isActive: true,
    ...overrides,
  };
}

function defaultRoleMock(over = {}) {
  const base = {
    findUnique: vi.fn(async () => roleRow()),
    findMany: vi.fn(async () => [roleRow()]),
    create: vi.fn(async () => roleRow({ id: 'role_new' })),
    update: vi.fn(async () => roleRow()),
    count: vi.fn(async () => 1),
  };
  return { ...base, ...over };
}

function makePrisma(over: Partial<Record<string, unknown>> = {}) {
  return {
    user: {
      findUnique: vi.fn(async () => userRow()),
      findMany: vi.fn(async () => [userRow()]),
      count: vi.fn(async () => 1),
    },
    role: defaultRoleMock(),
    permission: {
      findUnique: vi.fn(async () => permissionRow()),
      findMany: vi.fn(async () => [permissionRow()]),
      update: vi.fn(async () => permissionRow()),
      count: vi.fn(async () => 1),
    },
    soDRestriction: {
      findMany: vi.fn(async () => [sodRow()]),
    },
    userRole: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => [grantRow()]),
      create: vi.fn(async () => grantRow()),
      update: vi.fn(async () => grantRow()),
      count: vi.fn(async () => 1),
    },
    rolePermission: {
      findMany: vi.fn(async () => []),
    },
    ...over,
  };
}

function makeService(prisma: AnyPrisma) {
  const audit = { record: vi.fn() };
  const permissions = {
    effectivePermissionKeys: vi.fn(async () => new Set(['warehouse.read'])),
  };
  const service = new RbacAdminService(prisma as never, audit as never, permissions as never);
  return { service, audit, permissions };
}

describe('RbacAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listStaff', () => {
    it('returns a paginated directory with totals and a cursor', async () => {
      const prisma = makePrisma({
        user: {
          findUnique: vi.fn(async () => userRow()),
          findMany: vi.fn(async () => [userRow({ roleAssignments: [{ id: 'userRole_1' }] })]),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      const response = await service.listStaff({});
      expect(response.data.items).toHaveLength(1);
      expect(response.data.total).toBe(1);
      expect(response.data.items[0]?.activeRoleCount).toBe(1);
      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('passes role, status and search filters to the query', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      await service.listStaff({ roleKey: 'warehouse-manager', status: UserStatus.ACTIVE, search: 'staff', limit: 25 });
      const call = (prisma.user.findMany as Mock).mock.calls[0]?.[0] as Record<string, unknown>;
      expect(call.where).toMatchObject({
        deletedAt: null,
        status: UserStatus.ACTIVE,
        roleAssignments: { some: { revokedAt: null, role: { key: 'warehouse-manager', isActive: true } } },
      });
      expect(call.take).toBe(26);
    });

    it('denies a bogus cursor', async () => {
      const prisma = makePrisma({ user: { findUnique: vi.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(service.listStaff({ cursor: 'bogus' })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getStaffDetail', () => {
    it('returns staff with active grants and effective permission keys', async () => {
      const prisma = makePrisma({
        user: {
          findUnique: vi.fn(async () =>
            userRow({
              roleAssignments: [
                grantRow(),
                grantRow({ id: 'userRole_revoked', revokedAt: new Date('2026-02-01T00:00:00.000Z'), revokeReason: 'x' }),
              ],
            }),
          ),
        },
      });
      const { service, permissions } = makeService(prisma);
      const response = await service.getStaffDetail('user_1');
      expect(response.data.staff.activeGrants).toHaveLength(1);
      expect(response.data.staff.effectivePermissionKeys).toEqual(['warehouse.read']);
      expect(permissions.effectivePermissionKeys).toHaveBeenCalledWith('user_1');
    });

    it('returns 404 when the user is deleted', async () => {
      const prisma = makePrisma({ user: { findUnique: vi.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(service.getStaffDetail('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('listRoles / getRole', () => {
    it('lists roles with sorted, active permission keys', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      const response = await service.listRoles();
      expect(response.data.items[0]?.permissionKeys).toEqual(['inventory.write']);
    });

    it('returns 404 for a missing role', async () => {
      const prisma = makePrisma({ role: { findUnique: vi.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(service.getRole('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('createRole', () => {
    it('creates a custom role and writes the audit trail', async () => {
      const prisma = makePrisma({ role: defaultRoleMock({ findUnique: vi.fn(async () => null) }) });
      const { service, audit } = makeService(prisma);
      const response = await service.createRole(ctx, { key: 'warehouse-manager', name: 'Warehouse Manager' });
      expect(response.data.role.key).toBe('warehouse-manager');
      const actions = (audit.record as Mock).mock.calls.map((c) => (c[0] as { action: string }).action);
      expect(actions).toEqual(['rbac.role.create.attempt', 'rbac.role.created']);
    });

    it('rejects a duplicate role key as a conflict', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      await expect(service.createRole(ctx, { key: 'warehouse-manager', name: 'X' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('updateRole', () => {
    it('rejects renaming a system role', async () => {
      const prisma = makePrisma({ role: defaultRoleMock({ findUnique: vi.fn(async () => roleRow({ isSystem: true })) }) });
      const { service } = makeService(prisma);
      await expect(service.updateRole(ctx, 'role_1', { name: 'Renamed' })).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'ROLE_IS_SYSTEM_READONLY' }),
      });
    });

    it('requires an explicit signal to reactivate a suspended role', async () => {
      const prisma = makePrisma({ role: defaultRoleMock({ findUnique: vi.fn(async () => roleRow({ isActive: false })) }) });
      const { service } = makeService(prisma);
      await expect(service.updateRole(ctx, 'role_1', { isActive: true })).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'EXPLICIT_SIGNAL_REQUIRED' }),
      });
    });

    it('reactivates when the explicit signal is present', async () => {
      const prisma = makePrisma({ role: defaultRoleMock({ findUnique: vi.fn(async () => roleRow({ isActive: false })) }) });
      const { service } = makeService(prisma);
      const response = await service.updateRole(ctx, 'role_1', { isActive: true, explicitSignal: true });
      expect(response.data.role.isActive).toBe(true);
    });

    it('blocks deactivating the system-admin role while held by active staff', async () => {
      const prisma = makePrisma({
        role: defaultRoleMock({ findUnique: vi.fn(async () => roleRow({ isSystem: true, key: 'system-admin' })) }),
        userRole: {
          findUnique: vi.fn(async () => null),
          findMany: vi.fn(async () => [grantRow()]),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () => grantRow()),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      await expect(service.updateRole(ctx, 'role_1', { isActive: false })).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'LAST_ADMIN_DEMOTION' }),
      });
    });
  });

  describe('togglePermission / listPermissions / listSoDRestrictions', () => {
    it('toggles a permission and audits the change', async () => {
      const prisma = makePrisma({
        permission: {
          findUnique: vi.fn(async () => permissionRow()),
          findMany: vi.fn(async () => [permissionRow()]),
          update: vi.fn(async () => permissionRow({ isActive: false })),
          count: vi.fn(async () => 1),
        },
      });
      const { service, audit } = makeService(prisma);
      const response = await service.togglePermission(ctx, 'perm_catalog_read', { isActive: false });
      expect(response.data.permission.isActive).toBe(false);
      expect((audit.record as Mock).mock.calls[0]?.[0]).toMatchObject({ action: 'rbac.permission.toggled' });
    });

    it('lists the permission registry and SoD restrictions', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      const permissions = await service.listPermissions();
      expect(permissions.data.items).toHaveLength(1);
      const restrictions = await service.listSoDRestrictions();
      expect(restrictions.data.items[0]?.permissionKeys).toEqual(['pricing.write', 'finance.approve.pricing']);
    });
  });

  describe('grantRole', () => {
    it('grants a fresh role and records the audit trail', async () => {
      const prisma = makePrisma();
      const { service, audit } = makeService(prisma);
      const response = await service.grantRole(ctx, 'user_1', { roleId: 'role_1', reason: 'Cover' });
      expect(response.data.assignment.roleKey).toBe('warehouse-manager');
      const actions = (audit.record as Mock).mock.calls.map((c) => (c[0] as { action: string }).action);
      expect(actions).toEqual(['rbac.grant.attempt', 'rbac.grant.granted']);
      expect((prisma.userRole.create as Mock).mock.calls[0]?.[0]?.data).toMatchObject({ roleId: 'role_1' });
    });

    it('rejects a missing user or role with 404', async () => {
      const prisma = makePrisma({ user: { findUnique: vi.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(service.grantRole(ctx, 'missing', { roleId: 'role_1' })).rejects.toMatchObject({ status: 404 });
    });

    it('rejects granting a suspended role', async () => {
      const prisma = makePrisma({ role: { findUnique: vi.fn(async () => roleRow({ isActive: false })) } });
      const { service } = makeService(prisma);
      await expect(service.grantRole(ctx, 'user_1', { roleId: 'role_1' })).rejects.toMatchObject({ status: 409 });
    });

    it('rejects an expiry in the past', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      await expect(service.grantRole(ctx, 'user_1', { roleId: 'role_1', expiresAt: '2020-01-01T00:00:00.000Z' })).rejects.toMatchObject({
        status: 422,
        response: expect.objectContaining({ code: 'GRANT_EXPIRY_IN_PAST' }),
      });
    });

    it('blocks a grant that creates a separation-of-duty conflict', async () => {
      const prisma = makePrisma({
        soDRestriction: { findMany: vi.fn(async () => [sodRow()]) },
        role: {
          findUnique: vi.fn(async () =>
            roleRow({ permissions: [{ permission: permissionRow({ key: 'pricing.write', id: 'perm_pricing' }) }] }),
          ),
        },
      });
      const audit = { record: vi.fn() };
      const permissions = {
        effectivePermissionKeys: vi.fn(async () => new Set(['finance.approve.pricing'])),
      };
      const service = new RbacAdminService(prisma as never, audit as never, permissions as never);
      await expect(service.grantRole(ctx, 'user_1', { roleId: 'role_1' })).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'SOD_VIOLATION' }),
      });
    });

    it('is idempotent for an already-active grant that is unchanged', async () => {
      const prisma = makePrisma({
        userRole: {
          findUnique: vi.fn(async () => grantRow({ revokedAt: null })),
          findMany: vi.fn(async () => [grantRow()]),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () => grantRow()),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      const response = await service.grantRole(ctx, 'user_1', { roleId: 'role_1' });
      expect(response.data.assignment.assignmentId).toBe('userRole_1');
      expect(prisma.userRole.create).not.toHaveBeenCalled();
    });

    it('reactivates a previously revoked grant', async () => {
      const prisma = makePrisma({
        userRole: {
          findUnique: vi.fn(async () => grantRow({ revokedAt: new Date('2026-01-05T00:00:00.000Z'), revokeReason: 'x' })),
          findMany: vi.fn(async () => [grantRow()]),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () => grantRow()),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      const response = await service.grantRole(ctx, 'user_1', { roleId: 'role_1' });
      const call = (prisma.userRole.update as Mock).mock.calls[0]?.[0] as { data: Record<string, unknown> };
      expect(call.data).toMatchObject({ revokedAt: null, assignedById: 'actor-1' });
      expect(response.data.assignment.revokedAt).toBeNull();
    });
  });

  describe('revokeRole', () => {
    it('revokes an active grant, auditing the change', async () => {
      const prisma = makePrisma({
        userRole: {
          findUnique: vi.fn(async () => grantRow()),
          findMany: vi.fn(async () => [grantRow(), grantRow({ id: 'userRole_2' })]),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () =>
            grantRow({ revokedAt: new Date('2026-09-13T00:00:00.000Z'), revokeReason: 'Cover ended' }),
          ),
          count: vi.fn(async () => 1),
        },
      });
      const { service, audit } = makeService(prisma);
      const response = await service.revokeRole(ctx, 'user_1', 'role_1', { revokeReason: 'Cover ended' });
      expect(response.data.changed).toBe(true);
      expect(response.data.assignment?.revokeReason).toBe('Cover ended');
      const actions = (audit.record as Mock).mock.calls.map((c) => (c[0] as { action: string }).action);
      expect(actions).toEqual(['rbac.revoke.attempt', 'rbac.revoke.revoked']);
    });

    it('is an idempotent no-op for a grant that never existed', async () => {
      const prisma = makePrisma({
        userRole: {
          findUnique: vi.fn(async () => null),
          findMany: vi.fn(async () => []),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () => grantRow()),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      const response = await service.revokeRole(ctx, 'user_1', 'missing', { revokeReason: 'x' });
      expect(response.data).toEqual({ assignment: null, changed: false });
    });

    it('blocks revoking the last active system-admin grant', async () => {
      const prisma = makePrisma({
        userRole: {
          findUnique: vi.fn(async () =>
            grantRow({ role: { key: 'system-admin', name: 'System Admin', description: null, isSystem: true } }),
          ),
          findMany: vi.fn(async () => [grantRow({ role: { key: 'system-admin', name: 'System Admin', description: null, isSystem: true } })]),
          create: vi.fn(async () => grantRow()),
          update: vi.fn(async () => grantRow()),
          count: vi.fn(async () => 1),
        },
      });
      const { service } = makeService(prisma);
      await expect(service.revokeRole(ctx, 'user_1', 'role_1', { revokeReason: 'x' })).rejects.toMatchObject({
        status: 409,
        response: expect.objectContaining({ code: 'LAST_ADMIN_DEMOTION' }),
      });
    });
  });

  describe('previewRoleDeactivation', () => {
    it('returns impacted users with their lost permission keys', async () => {
      const prisma = makePrisma();
      const { service } = makeService(prisma);
      const response = await service.previewRoleDeactivation('role_1');
      expect(response.data.role.roleKey).toBe('warehouse-manager');
      expect(response.data.deactivation.totalActiveAssignments).toBe(1);
      expect(response.data.deactivation.users[0]?.lostPermissionKeys).toEqual([]);
    });

    it('returns 404 for a missing role', async () => {
      const prisma = makePrisma({ role: { findUnique: vi.fn(async () => null) } });
      const { service } = makeService(prisma);
      await expect(service.previewRoleDeactivation('missing')).rejects.toMatchObject({ status: 404 });
    });
  });
});