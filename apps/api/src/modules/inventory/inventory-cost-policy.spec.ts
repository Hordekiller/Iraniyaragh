import { describe, expect, it, vi } from 'vitest';
import type { InventoryCostPolicyUpdate } from '@iranyaragh/contracts';
import { costPolicyInput } from './inventory-cost-policy.validation';
import { InventoryCostPolicyService } from './inventory-cost-policy.service';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditLogService } from '../audit/audit-log.service';
import { RedactedLogger } from '../../common/redacted-logger';
const valid: InventoryCostPolicyUpdate = { method: null, expectedVersion: null, reason: 'بررسی روش' };
describe('Cost policy strict normalization', () => {
  it.each([null, 'FIFO', 'MOVING_WEIGHTED_AVERAGE'] as const)('preserves explicit method %s', method => {
    expect(costPolicyInput({ ...valid, method, reason: `  ${valid.reason}  ` })).toEqual({ ...valid, method });
  });
  it.each([{ method: undefined }, { method: 'AVERAGE' }, { method: '' }, { expectedVersion: undefined }, { expectedVersion: 0 }, { expectedVersion: 1.5 },
    { expectedVersion: 2147483647 }, { reason: '' }, { reason: ' ' }, { reason: '<script>' }, { reason: 'bad\ntext' }, { reason: 'bad\u202etext' }, { reason: 'x'.repeat(501) }])('rejects invalid explicit input %j', patch => {
    expect(() => costPolicyInput({ ...valid, ...patch } as InventoryCostPolicyUpdate)).toThrow();
  });
  it('read failure returns an unavailable state, never a blank/zero valuation or raw diagnostics', async () => {
    const log = vi.spyOn(RedactedLogger.prototype, 'event').mockImplementation(() => undefined);
    const database = { inventoryCostPolicyRevision: { findFirst: async () => { throw new Error('private connection/credential diagnostic'); } } } as unknown as PrismaService;
    const service = new InventoryCostPolicyService(database, {} as AuditLogService);
    await expect(service.read()).rejects.toMatchObject({ response: { code: 'INVENTORY_COST_POLICY_UNAVAILABLE' } });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private'); log.mockRestore();
  });
  it.each([['', 'tracked'], ['operator', ''], ['operator', 'x'.repeat(101)]])('rejects missing actor/correlation before database access', async (actor, requestId) => {
    const transaction = vi.fn();
    const service = new InventoryCostPolicyService({ $transaction: transaction } as unknown as PrismaService, {} as AuditLogService);
    await expect(service.revise(actor, requestId, valid, 'key')).rejects.toMatchObject({ response: { code: 'INVENTORY_COST_POLICY_UNAVAILABLE' } });
    expect(transaction).not.toHaveBeenCalled();
  });
});
