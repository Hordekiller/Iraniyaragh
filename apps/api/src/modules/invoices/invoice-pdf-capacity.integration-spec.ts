import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { INVOICE_PDF_CAPACITY_AUDIT_ACTION, INVOICE_PDF_CAPACITY_ID, InvoicePdfCapacityService } from './invoice-pdf-capacity.service';

describe.sequential('Invoice PDF capacity approval PostgreSQL acceptance', () => {
  const prisma = new PrismaService(); const audit = new AuditLogService(prisma); const service = new InvoicePdfCapacityService(prisma, audit);
  const run = randomUUID().replaceAll('-', ''); const requestId = `pdf-capacity-${run}`; let actorId = ''; let connected = false;
  const input = (expectedVersion: number, patch: Partial<{ enabled: boolean; budgetMegabytes: number; maxArtifacts: number; maxPendingJobs: number }> = {}) =>
    ({ expectedVersion, enabled: true, budgetMegabytes: 8, maxArtifacts: 10, maxPendingJobs: 2, ...patch });
  async function clear() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "InvoicePdfRenderJobCommand", "InvoicePdfRenderJob", "InvoicePdfArtifact", "InvoicePdfStorageCapacity" CASCADE');
    await prisma.auditLog.deleteMany({ where: { action: INVOICE_PDF_CAPACITY_AUDIT_ACTION } });
  }
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    actorId = (await prisma.user.create({ data: { email: `${run}@example.test`, status: 'ACTIVE' } })).id;
  });
  beforeEach(clear);
  afterAll(async () => {
    if (!connected) return;
    await clear(); await prisma.user.deleteMany({ where: { id: actorId } }); await prisma.$disconnect();
  });

  it('reports an unapproved store as not configured and disabled', async () => {
    expect(await service.read()).toEqual({ configured: false, enabled: false, version: 0, budgetMegabytes: 0, maxArtifacts: 0, maxPendingJobs: 0, storedBytes: 0, artifactCount: 0, pendingJobCount: 0 });
  });

  it('records the first approval, later changes and switching off, each with audit evidence', async () => {
    const first = await service.update(actorId, requestId, input(0));
    expect(first).toMatchObject({ configured: true, enabled: true, version: 1, budgetMegabytes: 8, maxArtifacts: 10, maxPendingJobs: 2, storedBytes: 0, artifactCount: 0, pendingJobCount: 0 });
    const row = await prisma.invoicePdfStorageCapacity.findUniqueOrThrow({ where: { id: INVOICE_PDF_CAPACITY_ID } });
    expect(row.budgetBytes).toBe(8n * 1024n * 1024n);
    const resized = await service.update(actorId, requestId, input(1, { budgetMegabytes: 16, maxArtifacts: 20 }));
    expect(resized).toMatchObject({ version: 2, budgetMegabytes: 16, maxArtifacts: 20, enabled: true });
    const off = await service.update(actorId, requestId, input(2, { budgetMegabytes: 16, maxArtifacts: 20, enabled: false }));
    expect(off).toMatchObject({ version: 3, enabled: false });
    const logs = await prisma.auditLog.findMany({ where: { action: INVOICE_PDF_CAPACITY_AUDIT_ACTION }, orderBy: { createdAt: 'asc' } });
    expect(logs).toHaveLength(3);
    expect(logs.every(log => log.actorId === actorId && log.entityId === INVOICE_PDF_CAPACITY_ID)).toBe(true);
    expect(logs[0]!.before).toMatchObject({ enabled: false, version: 0 });
    expect(logs[2]!.after).toMatchObject({ enabled: false, version: 3, budgetMegabytes: 16 });
  });

  it('rejects a stale version and lets exactly one of two concurrent first approvals win', async () => {
    const results = await Promise.allSettled([service.update(actorId, requestId, input(0)), service.update(actorId, requestId, input(0, { budgetMegabytes: 32 }))]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.getResponse()).toMatchObject({ code: 'STALE_VERSION' });
    await expect(service.update(actorId, requestId, input(0))).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    expect((await service.read()).version).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: INVOICE_PDF_CAPACITY_AUDIT_ACTION } })).toBe(1);
  });

  it('never lowers the approval below pending work and leaves the counters to the database', async () => {
    await service.update(actorId, requestId, input(0, { maxPendingJobs: 3 }));
    // Pending jobs are counted by the job service; simulate two reserved slots the same way it does.
    await prisma.invoicePdfStorageCapacity.update({ where: { id: INVOICE_PDF_CAPACITY_ID }, data: { pendingJobCount: 2, version: { increment: 1 } } });
    await expect(service.update(actorId, requestId, input(2, { maxPendingJobs: 1 }))).rejects.toMatchObject({ response: { code: 'CAPACITY_BELOW_USAGE' } });
    const kept = await service.update(actorId, requestId, input(2, { maxPendingJobs: 2, budgetMegabytes: 4 }));
    expect(kept).toMatchObject({ version: 3, maxPendingJobs: 2, pendingJobCount: 2, budgetMegabytes: 4, storedBytes: 0, artifactCount: 0 });
  });

  it('rejects invalid input without writing', async () => {
    for (const bad of [input(0, { budgetMegabytes: 0 }), input(0, { budgetMegabytes: 2000 }), input(0, { maxArtifacts: 0 }), input(0, { maxPendingJobs: 50 }), { ...input(0), expectedVersion: -1 }]) {
      await expect(service.update(actorId, requestId, bad)).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    }
    expect((await service.read()).configured).toBe(false);
  });
});
