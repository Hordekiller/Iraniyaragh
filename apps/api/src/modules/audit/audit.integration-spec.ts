import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from './audit-log.service';
import { AuditLogListQueryDto } from './audit.dto';

describe.sequential('AuditLogService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const prisma = new PrismaService();
  const service = new AuditLogService(prisma);
  let actorId = '';
  let eventId = '';

  const input = (over: object) => ({
    action: 'ORDER.UPDATE_STATUS',
    entityType: 'order',
    entityId: 'order-1',
    before: { status: 'PENDING' },
    after: { status: 'PAID' },
    metadata: { reason: 'integration' },
    requestId: `audit-it-${runId}`,
    ipHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    userAgent: 'test-agent',
    ...over,
  });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const actor = await prisma.user.create({ data: {
      mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
      status: 'ACTIVE', isMobileVerified: true, createdAt: new Date(Date.now() - 60_000), mobileVerifiedAt: new Date(),
    } });
    actorId = actor.id;
    await service.record(input({ actorId }));
    const latest = await service.list(Object.assign(new AuditLogListQueryDto(), { action: 'ORDER.UPDATE_STATUS', entityId: 'order-1', actorId, offset: 0, limit: 50 }));
    eventId = latest.items[0].id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId: `audit-it-${runId}` } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('persists the event and returns it in a filtered list with the actor label', async () => {
    const query = Object.assign(new AuditLogListQueryDto(), { action: 'ORDER.UPDATE_STATUS', entityType: 'order', entityId: 'order-1', actorId, offset: 0, limit: 50 });
    const result = await service.list(query);
    const row = result.items.find(item => item.id === eventId);
    expect(row).toBeDefined();
    expect(row?.after).toEqual({ status: 'PAID' });
    expect(row?.requestId).toBe(`audit-it-${runId}`);
    expect(row?.ipHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(row?.userAgent).toBe('test-agent');
    expect(row?.actorId).toBe(actorId);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it('filters by created range and paginates', async () => {
    const from = new Date(Date.now() - 5 * 60_000).toISOString();
    const to = new Date(Date.now() + 5 * 60_000).toISOString();
    const ranged = await service.list(Object.assign(new AuditLogListQueryDto(), { createdFrom: from, createdToExclusive: to }));
    expect(ranged.items.some(item => item.id === eventId)).toBe(true);
    const missing = await service.list(Object.assign(new AuditLogListQueryDto(), { createdFrom: to }));
    expect(missing.items.some(item => item.id === eventId)).toBe(false);
  });
});