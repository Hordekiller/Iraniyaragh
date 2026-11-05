import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CUSTOMER_HELPER_FLAG, StorefrontHelperService } from './storefront-helper.service';

describe.sequential('Storefront customer helper switch database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const prisma = new PrismaService();
  const service = new StorefrontHelperService(prisma, new AuditLogService(prisma));
  let connected = false;
  let actorId = '';

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    await prisma.storefrontFeatureFlag.deleteMany({ where: { key: CUSTOMER_HELPER_FLAG } });
    const actor = await prisma.user.create({
      data: { mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`, status: 'ACTIVE', isMobileVerified: true, createdAt: new Date(Date.now() - 60_000), mobileVerifiedAt: new Date() },
    });
    actorId = actor.id;
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({ where: { entityId: CUSTOMER_HELPER_FLAG, action: 'storefront.customer_helper.updated' } });
    await prisma.storefrontFeatureFlag.deleteMany({ where: { key: CUSTOMER_HELPER_FLAG } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('is enabled by default, switches off and on with versioning and an audit trail', async () => {
    expect(await service.readPublic()).toEqual({ enabled: true });
    expect((await service.readAdmin()).version).toBe(0);

    const off = await service.update(actorId, `req-${runId}-1`, { expectedVersion: 0, enabled: false });
    expect(off).toMatchObject({ enabled: false, version: 1 });
    expect(await service.readPublic()).toEqual({ enabled: false });

    const on = await service.update(actorId, `req-${runId}-2`, { expectedVersion: 1, enabled: true });
    expect(on).toMatchObject({ enabled: true, version: 2 });
    expect(await service.readPublic()).toEqual({ enabled: true });

    const audits = await prisma.auditLog.findMany({ where: { entityId: CUSTOMER_HELPER_FLAG, action: 'storefront.customer_helper.updated' }, orderBy: { createdAt: 'asc' } });
    expect(audits).toHaveLength(2);
    expect(audits.every(row => row.actorId === actorId)).toBe(true);
  });

  it('rejects a stale version and leaves the stored value untouched', async () => {
    await expect(service.update(actorId, `req-${runId}-3`, { expectedVersion: 1, enabled: false })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    expect(await service.readAdmin()).toMatchObject({ enabled: true, version: 2 });
  });

  it('lets only one of two concurrent writers with the same version win', async () => {
    const results = await Promise.allSettled([
      service.update(actorId, `req-${runId}-4`, { expectedVersion: 2, enabled: false }),
      service.update(actorId, `req-${runId}-5`, { expectedVersion: 2, enabled: false }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await service.readAdmin()).toMatchObject({ enabled: false, version: 3 });
  });
});
