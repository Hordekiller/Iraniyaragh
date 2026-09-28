import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { SuppliersService } from './suppliers.service';

describe.sequential('SuppliersService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const code = `SUP-${runId.toUpperCase()}`;
  const requestId = `supplier-it-${runId}`;
  const prisma = new PrismaService();
  const service = new SuppliersService(prisma, new AuditLogService(prisma));
  let actorId = '';
  let supplierId = '';
  const context = (key: string) => ({ actorId, requestId, idempotencyKey: `supplier-${key}-${runId}` });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const actor = await prisma.user.create({ data: {
      mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
      status: 'ACTIVE', isMobileVerified: true, createdAt: new Date(Date.now() - 60_000), mobileVerifiedAt: new Date(),
    } });
    actorId = actor.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId } });
    await prisma.supplierCommandRecord.deleteMany({ where: { actorId } });
    if (supplierId) await prisma.supplier.delete({ where: { id: supplierId } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('creates once across concurrent retries and rejects changed payload or duplicate code', async () => {
    const input = { code, name: 'Test Supplier' };
    const [first, replay] = await Promise.all([
      service.create(input, context('create')),
      service.create(input, context('create')),
    ]);
    supplierId = first.id;
    expect(replay).toEqual(first);
    expect(await prisma.supplier.count({ where: { code } })).toBe(1);
    await expect(service.create({ ...input, name: 'Another' }, context('create'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create(input, context('duplicate'))).rejects.toMatchObject({ response: { code: 'SUPPLIER_CODE_CONFLICT' } });
    expect(await prisma.auditLog.count({ where: { requestId, action: 'supplier.created' } })).toBe(1);
  });

  it('lists, updates with version checks, replays writes and preserves history', async () => {
    const before = await service.get(supplierId);
    expect(before.version).toBe(0);
    expect((await service.list({ offset: 0, limit: 50 })).items.some(row => row.id === supplierId)).toBe(true);
    const updated = await service.update(supplierId, { expectedVersion: 0, name: 'Renamed Supplier' }, context('rename'));
    expect(updated).toMatchObject({ version: 1, name: 'Renamed Supplier' });
    expect(await service.update(supplierId, { expectedVersion: 0, name: 'Renamed Supplier' }, context('rename'))).toEqual(updated);
    await expect(service.update(supplierId, { expectedVersion: 0, name: 'Stale' }, context('stale'))).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(supplierId, { expectedVersion: 1 }, context('empty'))).rejects.toBeInstanceOf(BadRequestException);
    const inactive = await service.update(supplierId, { expectedVersion: 1, isActive: false }, context('deactivate'));
    expect(inactive).toMatchObject({ isActive: false, version: 2 });
    expect((await service.list({ isActive: true, offset: 0, limit: 50 })).items.some(row => row.id === supplierId)).toBe(false);
    const history = await service.history(supplierId, { offset: 0, limit: 50 });
    expect(history.items.map(row => row.action)).toEqual(['supplier.deactivated', 'supplier.updated', 'supplier.created']);
    expect(await prisma.supplier.count({ where: { id: supplierId } })).toBe(1);
  });

  it('commits only one of two simultaneous edits against the same version', async () => {
    const attempts = await Promise.allSettled([
      service.update(supplierId, { expectedVersion: 2, name: 'Concurrent A' }, context('race-a')),
      service.update(supplierId, { expectedVersion: 2, name: 'Concurrent B' }, context('race-b')),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((attempts.find(result => result.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((await service.get(supplierId)).version).toBe(3);
    expect(await prisma.auditLog.count({ where: { requestId, action: 'supplier.updated' } })).toBe(2);
  });

  it('returns not found and rejects invalid retry keys without mutation', async () => {
    await expect(service.get('missing-supplier')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('missing-supplier', { expectedVersion: 0, name: 'Nope' }, context('missing'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create({ code: `${code}-2`, name: 'Nope' }, { actorId, requestId, idempotencyKey: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    expect(await prisma.supplier.count({ where: { code: `${code}-2` } })).toBe(0);
  });
});
