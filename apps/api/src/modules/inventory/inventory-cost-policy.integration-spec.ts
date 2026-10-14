import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { InventoryCostPolicyUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { RedactedLogger } from '../../common/redacted-logger';
import { InventoryCostPolicyService } from './inventory-cost-policy.service';

describe.sequential('Inactive inventory cost policy real PostgreSQL evidence', () => {
  const actorId = `cost_policy_${randomUUID()}`; const database = new PrismaService();
  const service = new InventoryCostPolicyService(database, new AuditLogService(database));
  const input: InventoryCostPolicyUpdate = { method: null, expectedVersion: null, reason: 'روش بعد از بررسی دفتر هزینه تعیین می‌شود' };
  let connected = false;
  async function clear() {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await database.$executeRawUnsafe('TRUNCATE "InventoryCostPolicyCommand", "InventoryCostPolicyRevision"');
  }
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await database.$connect(); connected = true; await clear();
    await database.user.create({ data: { id: actorId, email: `${actorId}@example.test`, status: 'ACTIVE' } });
  });
  afterAll(async () => {
    if (!connected) return;
    await clear(); await database.auditLog.deleteMany({ where: { actorId } }); await database.user.delete({ where: { id: actorId } }); await database.$disconnect();
  });
  it('starts undecided and disabled; never infers a catalog-price basis', async () => {
    expect(await service.read()).toEqual({ policy: null, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE' });
  });
  it('serializes concurrent repeated submission to one immutable revision, command and redacted audit', async () => {
    const results = await Promise.all([1, 2, 3].map(n => service.revise(actorId, `cost-submit-${n}`, input, 'same-submit')));
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]);
    expect(results[0]).toMatchObject({ policy: { version: 1, method: null }, valuationEnabled: false });
    expect(await database.inventoryCostPolicyRevision.count()).toBe(1);
    expect(await database.inventoryCostPolicyCommand.count()).toBe(1);
    const audits = await database.auditLog.findMany({ where: { actorId } }); expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain(input.reason);
    for (const field of ['actorId', 'requestId', 'reason', 'keyHash', 'payloadHash']) expect(results[0].policy).not.toHaveProperty(field);
  });
  it('persists an explicit method without enabling valuation or modifying stock/financial tables', async () => {
    const counts = async () => [await database.inventoryMovement.count(), await database.payment.count(), await database.creditLedgerEntry.count()];
    const before = await counts();
    const result = await service.revise(actorId, 'cost-select', { ...input, expectedVersion: 1, method: 'FIFO' }, 'select-fifo');
    expect(result).toMatchObject({ policy: { method: 'FIFO', version: 2 }, valuationEnabled: false, missingCostTreatment: 'REQUIRE_EVIDENCE' });
    expect(await counts()).toEqual(before);
  });
  it('historical replay after restart never resets the selected head; changed payload conflicts', async () => {
    const restarted = new InventoryCostPolicyService(database, new AuditLogService(database));
    expect((await restarted.revise(actorId, 'cost-restart', input, 'same-submit')).policy).toMatchObject({ version: 1, method: null });
    expect((await restarted.read()).policy).toMatchObject({ version: 2, method: 'FIFO' });
    await expect(restarted.revise(actorId, 'cost-conflict', { ...input, method: 'FIFO' }, 'same-submit')).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });
  it('two concurrent distinct requests against the same version cannot both revise', async () => {
    const results = await Promise.allSettled(['a', 'b'].map(key => service.revise(actorId, `cost-${key}`, { ...input, expectedVersion: 2, method: 'MOVING_WEIGHTED_AVERAGE' }, key)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'STALE_VERSION' } } });
    expect((await service.read()).policy).toMatchObject({ version: 3, method: 'MOVING_WEIGHTED_AVERAGE' });
  });
  it('SQL rejects overwriting/deleting evidence and nonsequential revisions', async () => {
    const current = (await service.read()).policy!;
    await expect(database.inventoryCostPolicyRevision.update({ where: { id: current.id }, data: { method: 'FIFO' } })).rejects.toThrow();
    await expect(database.inventoryCostPolicyRevision.delete({ where: { id: current.id } })).rejects.toThrow();
    const command = await database.inventoryCostPolicyCommand.findFirstOrThrow({ where: { revisionId: current.id } });
    await expect(database.inventoryCostPolicyCommand.update({ where: { id: command.id }, data: { payloadHash: 'a'.repeat(64) } })).rejects.toThrow();
    await expect(database.inventoryCostPolicyCommand.delete({ where: { id: command.id } })).rejects.toThrow();
    await expect(database.inventoryCostPolicyRevision.create({ data: { version: 9, method: null, reason: input.reason, actorId, requestId: 'nonsequential' } })).rejects.toThrow();
    for (const reason of [' ', '<unsafe>', 'unsafe\nreason'])
      await expect(database.inventoryCostPolicyRevision.create({ data: { version: 4, method: null, reason, actorId, requestId: 'invalid-reason' } })).rejects.toThrow();
  });
  it('audit failure rolls back revision and command and never logs raw reason', async () => {
    const event = vi.spyOn(RedactedLogger.prototype, 'event').mockImplementation(() => undefined);
    const failing = new InventoryCostPolicyService(database, { record: async () => { throw new Error(input.reason); } } as unknown as AuditLogService);
    await expect(failing.revise(actorId, 'cost-audit', { ...input, expectedVersion: 3 }, 'failed-audit')).rejects.toMatchObject({ response: { code: 'INVENTORY_COST_POLICY_UNAVAILABLE' } });
    expect(await database.inventoryCostPolicyRevision.count()).toBe(3); expect(await database.inventoryCostPolicyCommand.count()).toBe(3);
    expect(JSON.stringify(event.mock.calls)).not.toContain(input.reason); event.mockRestore();
  });
});
