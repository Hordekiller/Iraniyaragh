import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from './audit-log.service';
import { AuditLogListQueryDto } from './audit.dto';

const row = {
  id: 'audit-1',
  actorId: 'user-1',
  action: 'ORDER.UPDATE_STATUS',
  entityType: 'order',
  entityId: 'order-1',
  before: { status: 'PENDING' },
  after: { status: 'PAID' },
  metadata: { reason: 'staff override' },
  requestId: 'request-1',
  ipHash: 'hash-1',
  userAgent: 'Mozilla/5.0',
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  actor: { id: 'user-1', mobile: '+989120000001', firstName: 'سارا', lastName: 'احمدی' },
};

function setup() {
  const prisma = {
    auditLog: {
      findMany: vi.fn(async () => [row]),
      count: vi.fn(async () => 1),
      create: vi.fn(async () => row),
    },
    $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  return { prisma, service: new AuditLogService(prisma as unknown as PrismaService) };
}

describe('AuditLogService', () => {
  it('filters by action, entity, actor and created range and serializes the actor label', async () => {
    const { prisma, service } = setup();
    const query = Object.assign(new AuditLogListQueryDto(), {
      offset: 10,
      limit: 25,
      action: 'ORDER.UPDATE_STATUS',
      entityType: 'order',
      entityId: 'order-1',
      actorId: 'user-1',
    });
    const result = await service.list(query);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { action: 'ORDER.UPDATE_STATUS', entityType: 'order', entityId: 'order-1', actorId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 25,
    }));
    expect(result).toEqual({
      items: [expect.objectContaining({
        id: 'audit-1',
        actorId: 'user-1',
        actorLabel: 'سارا احمدی',
        createdAt: '2026-09-20T10:00:00.000Z',
      })],
      count: 1,
    });
  });

  it('builds a created-range predicate only when a bound is present', async () => {
    const { prisma, service } = setup();
    const ranged = Object.assign(new AuditLogListQueryDto(), {
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-10-01T00:00:00.000Z',
    });
    await service.list(ranged);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { gte: new Date('2026-09-01T00:00:00.000Z'), lt: new Date('2026-10-01T00:00:00.000Z') } },
    }));

    const unbound = Object.assign(new AuditLogListQueryDto(), {});
    await service.list(unbound);
    expect(prisma.auditLog.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
  });

  it('falls back to mobile or id when the actor has no display name', async () => {
    const anonymous = { ...row, actor: { id: 'user-1', mobile: '+989120000001', firstName: null, lastName: null } };
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn(async () => [anonymous]),
        count: vi.fn(async () => 1),
      },
      $transaction: vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries)),
    };
    const standalone = new AuditLogService(mockPrisma as unknown as PrismaService);
    const result = await standalone.list(Object.assign(new AuditLogListQueryDto(), {}));
    expect(result.items[0].actorLabel).toBe('+989120000001');
  });
});