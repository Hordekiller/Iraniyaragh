import { Prisma, UserStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditLogService } from '../audit/audit-log.service';
import type { AuthPermissionService } from '../auth/auth-permission.service';
import { AccessService } from './access.service';

vi.mock('../../common/retry', () => ({ retryDelayMs: () => 0, sleep: vi.fn(async () => undefined) }));

const date = new Date('2026-01-01T00:00:00Z');
const permissionRows = ['products.read', 'roles.manage', 'reports.read'].map((key, index) => ({
  id: `test-permission-${index}`, key, name: key, group: index === 0 ? 'catalog' : 'staff', description: null, isActive: true,
}));
const member = {
  id: 'test-assignment', userId: 'test-user', roleId: 'test-role', assignedAt: date, expiresAt: null, revokedAt: null,
  user: { id: 'test-user', status: UserStatus.ACTIVE, mobile: '09000000000', email: 'synthetic@example.test', firstName: 'کاربر', lastName: 'آزمایشی' },
};
const baseRole = {
  id: 'test-role', key: 'test-staff', name: 'نقش آزمایشی', description: null, isSystem: false, isActive: true,
  version: 1, createdAt: date, updatedAt: date,
  permissions: permissionRows.slice(0, 2).map((permission, index) => ({ id: `test-grant-${index}`, permission })),
  users: [member, { ...member, id: 'test-expired', expiresAt: new Date('2020-01-01'), user: { ...member.user, email: 'synthetic-invalid-address', firstName: null, lastName: null } }],
};
const context = { actorId: 'test-actor', requestId: 'test-request', idempotencyKey: 'test-command-key' };
const createInput = { key: 'test-staff', name: 'نقش آزمایشی', permissionKeys: ['roles.manage', 'products.read'] };

function harness() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    role: { findMany: vi.fn().mockResolvedValue([baseRole]), findUnique: vi.fn().mockResolvedValue(baseRole), create: vi.fn().mockResolvedValue(baseRole), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    permission: { findMany: vi.fn().mockImplementation(async ({ where }: { where?: { key?: { in: string[] } } } = {}) => permissionRows.filter(row => !where?.key || where.key.in.includes(row.key))) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'test-user', status: UserStatus.ACTIVE, deletedAt: null }), findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    userRole: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), create: vi.fn().mockResolvedValue(member), update: vi.fn().mockResolvedValue(member) },
    rolePermission: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    accessCommandRecord: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'test-command' }), update: vi.fn().mockResolvedValue({}) },
    auditLog: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
  };
  const transaction = vi.fn(async (input: unknown) => typeof input === 'function'
    ? (input as (client: typeof tx) => Promise<unknown>)(tx)
    : Promise.all(input as Promise<unknown>[]));
  const prisma = { ...tx, $transaction: transaction };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const permissions = { effectivePermissionKeys: vi.fn().mockResolvedValue(new Set(permissionRows.map(row => row.key))) };
  const service = new AccessService(prisma as unknown as PrismaService, audit as unknown as AuditLogService, permissions as unknown as AuthPermissionService);
  return { service, tx, transaction, audit, permissions };
}

describe('AccessService read projections', () => {
  it('counts unexpired members and masks member contact details', async () => {
    const h = harness();
    const summary = await h.service.listRoles();
    expect(summary[0]).toMatchObject({ memberCount: 2, activeMemberCount: 1, permissionKeys: ['products.read', 'roles.manage'] });
    const detail = await h.service.getRole(baseRole.id);
    expect(detail.members).toHaveLength(2);
    expect(JSON.stringify(detail)).not.toContain(member.user.mobile);
    expect(JSON.stringify(detail)).not.toContain(member.user.email);
    expect(detail.members.some(row => row.assignmentExpired)).toBe(true);
    expect(detail.permissions.map(row => row.key)).toEqual(['products.read', 'roles.manage']);
  });

  it('returns the permission catalog with stable public defaults', async () => {
    const h = harness();
    expect(await h.service.listPermissions()).toEqual(permissionRows.map(({ key, name, group, isActive }) => ({ key, name, group, isActive, description: '' })));
  });

  it('bounds staff search and exposes deduplicated roles without raw contact values', async () => {
    const h = harness();
    h.tx.user.findMany.mockResolvedValue([{ ...member.user, createdAt: date, roleAssignments: [{ role: { key: 'system-admin' } }, { role: { key: 'system-admin' } }] }]);
    h.tx.user.count.mockResolvedValue(1);
    const result = await h.service.listUsers({ search: ' synthetic ', page: 2, perPage: 10 });
    expect(result.items[0]).toMatchObject({ roleKeys: ['system-admin'], isActiveAdmin: true, displayName: 'کاربر آزمایشی' });
    expect(h.tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, where: expect.objectContaining({ deletedAt: null }) }));
    expect(JSON.stringify(result)).not.toContain(member.user.mobile);
    expect(JSON.stringify(result)).not.toContain(member.user.email);
  });

  it('scopes audit history to the selected role and access events', async () => {
    const h = harness();
    h.tx.auditLog.findMany.mockResolvedValue([{ id: 'test-audit', action: 'access.role.updated', actorId: 'test-actor', actor: { firstName: null, lastName: null, id: 'test-actor' }, metadata: {}, createdAt: date }]);
    h.tx.auditLog.count.mockResolvedValue(1);
    const result = await h.service.history(baseRole.id, { page: 2, perPage: 5 });
    expect(result.items[0]).toMatchObject({ actorLabel: 'test-actor', createdAt: date.toISOString() });
    expect(h.tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 5, take: 5, where: { entityType: 'Role', entityId: baseRole.id, action: { startsWith: 'access.role.' } } }));
  });

  it('does not expose absent roles or their history', async () => {
    const h = harness();
    h.tx.role.findUnique.mockResolvedValue(null);
    await expect(h.service.getRole('absent')).rejects.toMatchObject({ response: { code: 'ACCESS_NOT_FOUND' } });
    await expect(h.service.history('absent', { page: 1, perPage: 5 })).rejects.toMatchObject({ response: { code: 'ACCESS_NOT_FOUND' } });
    expect(h.tx.auditLog.findMany).not.toHaveBeenCalled();
  });
});

describe('AccessService command safety', () => {
  it('creates grants and their audit in a serializable command, then replays without duplicate effects', async () => {
    const h = harness();
    h.tx.role.findUnique.mockResolvedValueOnce(null);
    const result = await h.service.createRole(createInput, context);
    expect(h.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(h.tx.$executeRaw).toHaveBeenCalledOnce();
    expect(h.permissions.effectivePermissionKeys).toHaveBeenCalledWith(context.actorId, expect.any(Date), h.tx);
    expect(h.tx.rolePermission.create).toHaveBeenCalledTimes(2);
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: context.actorId, action: 'access.role.created', entityId: baseRole.id }), h.tx);
    const record = h.tx.accessCommandRecord.create.mock.calls[0][0].data;
    expect(JSON.stringify(record)).not.toContain(context.idempotencyKey);
    h.tx.accessCommandRecord.findUnique.mockResolvedValue({ requestHash: record.requestHash, response: result });
    expect(await h.service.createRole(createInput, context)).toEqual(result);
    expect(h.tx.role.create).toHaveBeenCalledOnce();
    expect(h.audit.record).toHaveBeenCalledOnce();
    await expect(h.service.createRole({ ...createInput, name: 'ورودی متفاوت' }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_IDEMPOTENCY_CONFLICT' } });
    expect(h.tx.role.create).toHaveBeenCalledOnce();
  });

  it('rejects malformed keys and oversized command identifiers before opening a transaction', async () => {
    const h = harness();
    await expect(h.service.createRole(createInput, { ...context, idempotencyKey: 'short' })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    await expect(h.service.updateRole('x'.repeat(170), { expectedVersion: 1 }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    expect(h.transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown permissions and privileges the actor cannot grant', async () => {
    const h = harness();
    await expect(h.service.createRole({ ...createInput, permissionKeys: ['unknown.permission'] }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    h.permissions.effectivePermissionKeys.mockResolvedValue(new Set(['products.read']));
    await expect(h.service.createRole(createInput, context)).rejects.toMatchObject({ status: 403 });
    expect(h.tx.role.create).not.toHaveBeenCalled();
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing role key', async () => {
    const h = harness();
    await expect(h.service.createRole(createInput, context)).rejects.toMatchObject({ response: { code: 'ACCESS_ROLE_EXISTS' } });
    expect(h.tx.role.create).not.toHaveBeenCalled();
  });

  it('preserves system roles and rejects stale role edits before auditing success', async () => {
    const h = harness();
    h.tx.role.findUnique.mockResolvedValueOnce({ ...baseRole, isSystem: true });
    await expect(h.service.updateRole(baseRole.id, { expectedVersion: 1, isActive: false }, context)).rejects.toMatchObject({ status: 403 });
    expect(h.tx.role.updateMany).not.toHaveBeenCalled();
    h.tx.role.updateMany.mockResolvedValue({ count: 0 });
    await expect(h.service.updateRole(baseRole.id, { expectedVersion: 0, name: 'نام آزمایشی' }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_VERSION_CONFLICT' } });
    expect(h.audit.record).not.toHaveBeenCalled();
  });

  it('audits a versioned role update and refuses to commit removal of the last administrator', async () => {
    const h = harness();
    await h.service.updateRole(baseRole.id, { expectedVersion: 1, name: 'نام تازه', description: null, isActive: true }, context);
    expect(h.tx.role.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: baseRole.id, version: 1 } }));
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.role.updated', before: expect.objectContaining({ name: baseRole.name }), after: expect.objectContaining({ name: 'نام تازه' }) }), h.tx);
    const unsafe = harness();
    unsafe.tx.userRole.count.mockResolvedValue(0);
    await expect(unsafe.service.updateRole(baseRole.id, { expectedVersion: 1, isActive: false }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_LAST_ADMIN' } });
    expect(unsafe.tx.accessCommandRecord.update).not.toHaveBeenCalled();
  });

  it('keeps roles.manage on the system administrator role', async () => {
    const h = harness();
    h.tx.role.findUnique.mockResolvedValue({ ...baseRole, key: 'system-admin', isSystem: true });
    await expect(h.service.replacePermissions(baseRole.id, { expectedVersion: 1, permissionKeys: ['products.read'] }, context)).rejects.toMatchObject({ status: 403 });
    expect(h.tx.rolePermission.updateMany).not.toHaveBeenCalled();
  });

  it('revokes removed grants, reactivates an existing grant and records both permission sets', async () => {
    const h = harness();
    h.tx.rolePermission.findUnique.mockResolvedValue({ id: 'prior-report-grant', revokedAt: date });
    await h.service.replacePermissions(baseRole.id, { expectedVersion: 1, permissionKeys: ['reports.read', 'products.read'] }, context);
    expect(h.tx.rolePermission.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ['test-grant-1'] } }, data: expect.objectContaining({ revokedById: context.actorId }) }));
    expect(h.tx.rolePermission.update).toHaveBeenCalledWith({ where: { id: 'prior-report-grant' }, data: expect.objectContaining({ revokedAt: null, grantedById: context.actorId }) });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.role.permissions.replaced', before: { permissionKeys: ['products.read', 'roles.manage'] }, after: { permissionKeys: ['products.read', 'reports.read'] } }), h.tx);
  });

  it('assigns an active member with bounded expiry and preserves assignment history on revocation', async () => {
    const h = harness();
    const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
    await h.service.assignMember(baseRole.id, { expectedVersion: 1, userId: member.user.id, expiresAt }, context);
    expect(h.tx.userRole.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: member.user.id, roleId: baseRole.id, expiresAt: new Date(expiresAt), assignedById: context.actorId }) });
    h.tx.userRole.findUnique.mockResolvedValue(member);
    await h.service.revokeMember(baseRole.id, member.user.id, { expectedVersion: 1, reason: 'دلیل آزمایشی' }, context);
    expect(h.tx.userRole.update).toHaveBeenCalledWith({ where: { id: member.id }, data: expect.objectContaining({ revokedAt: expect.any(Date), revokedById: context.actorId, revokeReason: 'دلیل آزمایشی' }) });
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'access.role.member.revoked' }), h.tx);
  });

  it.each(['not-a-date', '2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z'])('rejects invalid assignment expiry %s before changing membership', async expiresAt => {
    const h = harness();
    await expect(h.service.assignMember(baseRole.id, { expectedVersion: 1, userId: member.user.id, expiresAt }, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    expect(h.tx.userRole.create).not.toHaveBeenCalled();
    expect(h.tx.role.updateMany).not.toHaveBeenCalled();
  });

  it('rejects inactive roles/users and duplicate active memberships', async () => {
    const h = harness();
    const input = { expectedVersion: 1, userId: member.user.id };
    h.tx.role.findUnique.mockResolvedValueOnce({ ...baseRole, isActive: false });
    await expect(h.service.assignMember(baseRole.id, input, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    h.tx.user.findUnique.mockResolvedValueOnce({ id: member.user.id, status: UserStatus.SUSPENDED, deletedAt: null });
    await expect(h.service.assignMember(baseRole.id, input, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    h.tx.userRole.findUnique.mockResolvedValue(member);
    await expect(h.service.assignMember(baseRole.id, input, context)).rejects.toMatchObject({ response: { code: 'ACCESS_INPUT_INVALID' } });
    expect(h.tx.userRole.create).not.toHaveBeenCalled();
  });

  it('reuses the identity of revoked memberships when assigning them again', async () => {
    const h = harness();
    h.tx.userRole.findUnique.mockResolvedValue({ ...member, revokedAt: date });
    await h.service.assignMember(baseRole.id, { expectedVersion: 1, userId: member.user.id }, context);
    expect(h.tx.userRole.create).not.toHaveBeenCalled();
    expect(h.tx.userRole.update).toHaveBeenCalledWith({ where: { id: member.id }, data: expect.objectContaining({ revokedAt: null, revokedById: null, revokeReason: null }) });
  });

  it('maps exhausted serialization conflicts to a retryable outcome without reporting success', async () => {
    const h = harness();
    h.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('test conflict', { code: 'P2034', clientVersion: 'test' }));
    await expect(h.service.createRole(createInput, context)).rejects.toMatchObject({ response: { code: 'RETRYABLE_CONFLICT' } });
    expect(h.transaction).toHaveBeenCalledTimes(3);
    expect(h.audit.record).not.toHaveBeenCalled();
  });
});
