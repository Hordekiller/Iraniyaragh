import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InvoicePolicyUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { RedactedLogger } from '../../common/redacted-logger';
import { AuditLogService } from '../audit/audit-log.service';
import { InvoicePolicyService } from './invoice-policy.service';
import { invoicePolicyFields } from './invoice-policy.validation';

describe.sequential('Immutable store invoice policy PostgreSQL acceptance', () => {
  const actorId = `invoice_policy_${randomUUID()}`;
  const prisma = new PrismaService(); const service = new InvoicePolicyService(prisma, new AuditLogService(prisma));
  const input: InvoicePolicyUpdate = { sellerName: 'فروشندهٔ آزمون ایزوله', sellerAddress: 'نشانی عمومی آزمون', sellerContact: 'example.test',
    taxTreatment: 'EXCLUSIVE', taxRateBps: 1000, exemptionReason: null, discountCapBps: 1500, shippingTaxable: false, isActive: false,
    expectedVersion: null, reason: 'تصویب سیاست آزمون' };
  let connected = false;
  async function clear() {
    // Dedicated isolated database only; do not disable append-only triggers.
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$executeRawUnsafe('TRUNCATE "InvoicePdfRenderJobCommand", "InvoicePdfRenderJob", "InvoicePdfArtifact", "InvoicePdfStorageCapacity", "InvoicePublicationCommand", "InvoicePublicationEvent", "InvoicePublication", "InvoiceIssueCommand", "InvoiceDocumentEvent", "InvoiceDocumentLine", "InvoiceDocument", "InvoiceSeriesCounter", "InvoiceDraftCommand", "InvoiceDraftRevision", "InvoiceDraftLine", "InvoiceDraft", "InvoicePolicyCommand", "InvoicePolicyRevision"');
  }
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true; await clear();
    await prisma.user.create({ data: { id: actorId, email: `${actorId}@example.test`, status: 'ACTIVE' } });
  });
  afterAll(async () => {
    if (!connected) return;
    await clear(); await prisma.auditLog.deleteMany({ where: { actorId } }); await prisma.user.deleteMany({ where: { id: actorId } }); await prisma.$disconnect();
  });
  it('starts without an invented policy and blocks issuance', async () => {
    expect(await service.current()).toBeNull();
    await expect(prisma.$transaction(tx => service.requireActive(tx))).rejects.toMatchObject({ response: { code: 'INVOICE_POLICY_REQUIRED' } });
  });
  it('posts one revision, one durable command and redacted audit across concurrent same-key submits', async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => service.update(actorId, 'test-create', input, 'create-policy')));
    for (const result of results) expect(result).toEqual(results[0]);
    expect(results[0]).toMatchObject({ version: 1, isActive: false, sellerName: input.sellerName });
    expect(await prisma.invoicePolicyRevision.count()).toBe(1); expect(await prisma.invoicePolicyCommand.count()).toBe(1);
    const audits = await prisma.auditLog.findMany({ where: { actorId } }); expect(audits).toHaveLength(1);
    const evidence = JSON.stringify(audits); for (const text of [input.sellerName, input.sellerAddress, input.sellerContact, input.reason]) expect(evidence).not.toContain(text);
    expect(results[0]).not.toHaveProperty('actorId'); expect(results[0]).not.toHaveProperty('reason');
    await expect(prisma.$transaction(tx => service.requireActive(tx))).rejects.toMatchObject({ response: { code: 'INVOICE_POLICY_REQUIRED' } });
  });
  it('rejects same-key changed payload without changing the active revision', async () => {
    await expect(service.update(actorId, 'test-conflict', { ...input, taxRateBps: 2000 }, 'create-policy')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect((await service.current())?.version).toBe(1);
  });
  it('retains original seller/tax snapshots and replays old activation after restart/later revision', async () => {
    const first = await service.current();
    const second = await service.update(actorId, 'test-update', { ...input, expectedVersion: 1, sellerName: 'فروشندهٔ جدید آزمون', isActive: true }, 'activate-policy');
    expect(second.version).toBe(2); expect(second.id).not.toBe(first?.id);
    const restarted = new InvoicePolicyService(prisma, new AuditLogService(prisma));
    expect(await restarted.update(actorId, 'test-restart', input, 'create-policy')).toEqual(first);
    expect(await prisma.invoicePolicyRevision.findUnique({ where: { id: first!.id } })).toMatchObject({ sellerName: input.sellerName, taxRateBps: 1000, isActive: false });
    expect(await prisma.$transaction(tx => service.requireActive(tx))).toEqual(second);
    await expect(service.update(actorId, 'test-stale', { ...input, expectedVersion: 1 }, 'stale-policy')).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
  });
  it('allows exactly one concurrent update from the same current version', async () => {
    const results = await Promise.allSettled([1500, 2500].map(rate => service.update(actorId, `test-rate-${rate}`, { ...input, expectedVersion: 2, taxRateBps: rate, isActive: true }, `rate-${rate}`)));
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(row => row.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_VERSION' } } });
    expect(await prisma.invoicePolicyRevision.count()).toBe(3); expect(await prisma.invoicePolicyCommand.count()).toBe(3);
  });
  it('preserves revision/command evidence against direct update/delete and nonsequential insert', async () => {
    const current = (await service.current())!;
    await expect(prisma.invoicePolicyRevision.update({ where: { id: current.id }, data: { taxRateBps: 0 } })).rejects.toThrow();
    await expect(prisma.invoicePolicyRevision.delete({ where: { id: current.id } })).rejects.toThrow();
    const command = await prisma.invoicePolicyCommand.findFirstOrThrow({ where: { revisionId: current.id } });
    await expect(prisma.invoicePolicyCommand.update({ where: { id: command.id }, data: { payloadHash: 'a'.repeat(64) } })).rejects.toThrow();
    await expect(prisma.invoicePolicyCommand.delete({ where: { id: command.id } })).rejects.toThrow();
    const fields = { ...invoicePolicyFields(input), reason: input.reason };
    await expect(prisma.invoicePolicyRevision.create({ data: { ...fields, actorId, requestId: 'test-sql-gap', version: 10 } })).rejects.toThrow();
    expect((await service.current())?.version).toBe(3);
  });
  it('uses database checks for rate, empty seller and exemption validity even outside service', async () => {
    const fields = { ...invoicePolicyFields(input), reason: input.reason };
    for (const patch of [{ taxRateBps: 10001 }, { sellerName: ' ' }, { taxTreatment: 'EXEMPT' as const, taxRateBps: 0, exemptionReason: null }, { discountCapBps: -1 }])
      await expect(prisma.invoicePolicyRevision.create({ data: { ...fields, ...patch, actorId, requestId: 'test-sql-check', version: 4 } })).rejects.toThrow();
    expect((await service.current())?.version).toBe(3);
  });
  it('rolls back revision, idempotency and audit together on audit failure without leaking inputs', async () => {
    const event = vi.spyOn(RedactedLogger.prototype, 'event').mockImplementation(() => undefined);
    const failing = new InvoicePolicyService(prisma, { record: async () => { throw new Error(input.sellerAddress); } } as unknown as AuditLogService);
    await expect(failing.update(actorId, 'test-audit-failure', { ...input, expectedVersion: 3 }, 'audit-failure')).rejects.toMatchObject({ response: { code: 'INVOICE_POLICY_UNAVAILABLE' } });
    expect(await prisma.invoicePolicyRevision.count()).toBe(3); expect(await prisma.invoicePolicyCommand.count()).toBe(3);
    expect(JSON.stringify(event.mock.calls)).not.toContain(input.sellerAddress); expect(JSON.stringify(event.mock.calls)).not.toContain(input.reason); event.mockRestore();
  });
  it('deactivation preserves history and prevents issuance', async () => {
    const result = await service.update(actorId, 'test-deactivate', { ...input, expectedVersion: 3, isActive: false }, 'deactivate');
    expect(result.version).toBe(4); expect(await prisma.invoicePolicyRevision.count()).toBe(4);
    await expect(prisma.$transaction(tx => service.requireActive(tx))).rejects.toMatchObject({ response: { code: 'INVOICE_POLICY_REQUIRED' } });
  });
});
