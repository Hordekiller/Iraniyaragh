import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { CreditService, MAX_CREDIT_IRR } from './credit.service';

// Only an isolated _test database may run this suite. Immutable tables are
// TRUNCATED at teardown, never made mutable and never used against sales data.
describe.sequential('Credit immutable evidence, ownership and PostgreSQL concurrency', () => {
  const prisma = new PrismaService();
  const service = new CreditService(prisma, new AuditLogService(prisma));
  const run = randomUUID().replaceAll('-', '');
  const customers: string[] = []; const users: string[] = [];
  let actorId = ''; let connected = false; let sequence = 0;
  const context = (key = `credit-${run}-${sequence++}`) => ({ actorId, requestId: `credit-it-${run}`, idempotencyKey: key });
  const now = () => new Date(Date.now() - 1000).toISOString();
  const code = (value: string) => expect.objectContaining({ response: expect.objectContaining({ code: value }) });
  const statement = (customerId: string) => service.statement(customerId, { offset: 0, limit: 25 });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    actorId = (await prisma.user.create({ data: { email: `credit-staff-${run}@example.test`, status: 'ACTIVE' } })).id;
    users.push(actorId);
  });
  afterAll(async () => {
    if (!connected) return;
    // The suite runs sequentially in a disposable database. This preserves the
    // production UPDATE/DELETE guards while removing this suite's financial data.
    await prisma.$executeRawUnsafe('TRUNCATE "CreditLedgerEntry", "CreditReceipt", "ReceivableDocument", "CreditCommandRecord", "CreditAccount"');
    await prisma.auditLog.deleteMany({ where: { requestId: `credit-it-${run}` } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  async function fixture(amount = '1000', dueAt = new Date(Date.now() + 86_400_000).toISOString()) {
    const suffix = `${run}-${sequence++}`;
    const user = await prisma.user.create({ data: { email: `credit-customer-${suffix}@example.test`, status: 'ACTIVE' } }); users.push(user.id);
    const mobile = `+989${String(BigInt(`0x${randomUUID().replaceAll('-', '').slice(0, 12)}`) % 1_000_000_000n).padStart(9, '0')}`;
    const customer = await prisma.customer.create({ data: { mobile, userId: user.id } }); customers.push(customer.id);
    const policy = await service.policy(customer.id, { expectedVersion: null, status: 'ACTIVE', creditLimit: amount, termsDays: 30 }, context());
    const input = { expectedVersion: policy.account.version, amount, issuedAt: new Date(Date.now() - 86_400_000).toISOString(), dueAt, sourceReference: `isolated-opening-${suffix}` };
    const ctx = context();
    const opening = await service.opening(customer.id, input, ctx);
    return { customerId: customer.id, userId: user.id, opening, input, ctx };
  }
  const receive = (data: Awaited<ReturnType<typeof fixture>>, amount: string, version = data.opening.account.version,
    evidenceReference = `isolated-receipt-${run}-${sequence++}`, key?: string) => service.receipt(data.customerId, {
      expectedVersion: version, amount, method: 'BANK_TRANSFER', effectiveAt: now(), evidenceReference,
      allocations: [{ documentId: data.opening.documentId!, amount }],
    }, context(key));

  it('creates an account once across concurrent identical submissions and preserves policy replay after restart', async () => {
    const customer = await prisma.customer.create({ data: { mobile: `+989${String(Date.now() % 1_000_000_000).padStart(9, '0')}` } }); customers.push(customer.id);
    const input = { expectedVersion: null, status: 'SUSPENDED' as const, creditLimit: '0', termsDays: 0 };
    const ctx = context();
    const result = await Promise.all([service.policy(customer.id, input, ctx), service.policy(customer.id, { termsDays: 0, creditLimit: '0', status: 'SUSPENDED', expectedVersion: null }, ctx)]);
    expect(result[1]).toEqual(result[0]);
    expect(result[0].account).toMatchObject({ status: 'SUSPENDED', version: 0, outstanding: { amount: '0', currency: 'IRR' } });
    expect(await prisma.creditAccount.count({ where: { customerId: customer.id } })).toBe(1);
    expect(await new CreditService(prisma, new AuditLogService(prisma)).policy(customer.id, input, ctx)).toEqual(result[0]);
    await expect(service.policy(customer.id, { ...input, creditLimit: '1' }, ctx)).rejects.toEqual(code('IDEMPOTENCY_CONFLICT'));
  });

  it('posts exactly one evidenced opening balance and replays before checking the stale version', async () => {
    const data = await fixture();
    const result = await new CreditService(prisma, new AuditLogService(prisma)).opening(data.customerId, data.input, data.ctx);
    expect(result).toEqual(data.opening);
    expect(result.account.outstanding.amount).toBe('1000');
    expect(await prisma.receivableDocument.count({ where: { accountId: result.account.id } })).toBe(1);
    expect(await prisma.creditLedgerEntry.count({ where: { accountId: result.account.id } })).toBe(1);
    await expect(service.opening(data.customerId, { ...data.input, expectedVersion: result.account.version }, context())).rejects.toEqual(code('CREDIT_OPENING_EXISTS'));
    await expect(service.opening(data.customerId, { ...data.input, amount: '2000' }, data.ctx)).rejects.toEqual(code('IDEMPOTENCY_CONFLICT'));
  });

  it('allows only one concurrent current-version receipt and rejects a subsequent over-allocation', async () => {
    const data = await fixture();
    const results = await Promise.allSettled([receive(data, '700'), receive(data, '700')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { response: { code: 'CREDIT_VERSION_CONFLICT' } } });
    const current = await statement(data.customerId);
    expect(current.account!.outstanding.amount).toBe('300');
    expect(current.documents[0].status).toBe('PARTIALLY_PAID');
    await expect(receive(data, '301', current.account!.version)).rejects.toEqual(code('CREDIT_ALLOCATION_CONFLICT'));
    expect((await statement(data.customerId)).account!.outstanding.amount).toBe('300');
  });

  it('records a partial receipt once, rejects globally duplicate evidence and replays the original response after restart', async () => {
    const a = await fixture(); const b = await fixture();
    const evidenceReference = `isolated-global-evidence-${run}`; const ctx = context();
    const input = { expectedVersion: a.opening.account.version, amount: '500', method: 'CASH' as const, effectiveAt: now(), evidenceReference,
      allocations: [{ documentId: a.opening.documentId!, amount: '500' }] };
    const result = await service.receipt(a.customerId, input, ctx);
    expect(await new CreditService(prisma, new AuditLogService(prisma)).receipt(a.customerId, input, ctx)).toEqual(result);
    await expect(receive(b, '500', b.opening.account.version, evidenceReference.toUpperCase())).rejects.toEqual(code('CREDIT_EVIDENCE_CONFLICT'));
    expect(await prisma.creditReceipt.count({ where: { accountId: result.account.id } })).toBe(1);
  });

  it('reverses a receipt once without overwriting its immutable financial evidence', async () => {
    const data = await fixture(); const receipt = await receive(data, '1000');
    expect((await statement(data.customerId)).documents[0].status).toBe('PAID');
    const input = { expectedVersion: receipt.account.version, effectiveAt: now(), evidenceReference: 'isolated-reversal-proof', reason: 'Isolated operator correction' };
    const ctx = context();
    const reversed = await service.reverseReceipt(data.customerId, receipt.receiptId!, input, ctx);
    expect(reversed.account.outstanding.amount).toBe('1000');
    expect(await service.reverseReceipt(data.customerId, receipt.receiptId!, input, ctx)).toEqual(reversed);
    await expect(service.reverseReceipt(data.customerId, receipt.receiptId!, { ...input, expectedVersion: reversed.account.version }, context())).rejects.toEqual(code('CREDIT_RECEIPT_REVERSED'));
    expect(await prisma.creditReceipt.findUniqueOrThrow({ where: { id: receipt.receiptId } })).toMatchObject({ amount: 1000n });
    const entries = await prisma.creditLedgerEntry.findMany({ where: { accountId: reversed.account.id } });
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0n)).toBe(1000n);
    expect(entries.filter(entry => entry.kind === 'RECEIPT_REVERSAL')).toHaveLength(1);
  });

  it('keeps opening snapshots unchanged through evidenced corrections and forbids a negative debt', async () => {
    const data = await fixture(); const original = await prisma.receivableDocument.findUniqueOrThrow({ where: { id: data.opening.documentId } });
    const adjusted = await service.adjust(data.customerId, original.id, { expectedVersion: data.opening.account.version, kind: 'CREDIT_NOTE', amount: '400', effectiveAt: now(), evidenceReference: 'isolated-correction', reason: 'Isolated correction' }, context());
    expect(adjusted.account.outstanding.amount).toBe('600');
    expect((await statement(data.customerId)).documents[0]).toMatchObject({ originalAmount: { amount: '1000' }, effectivePrincipal: { amount: '600' }, status: 'UNPAID' });
    expect(await prisma.receivableDocument.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original);
    await expect(service.adjust(data.customerId, original.id, { expectedVersion: adjusted.account.version, kind: 'CREDIT_NOTE', amount: '601', effectiveAt: now(), evidenceReference: 'isolated-too-much', reason: 'Invalid correction' }, context())).rejects.toEqual(code('CREDIT_ADJUSTMENT_CONFLICT'));
  });

  it('rejects an adjustment with reused evidence even when a reload generated a different idempotency key', async () => {
    const data = await fixture();
    const input = { expectedVersion: data.opening.account.version, kind: 'DEBIT_ADJUSTMENT' as const, amount: '10', effectiveAt: now(), evidenceReference: `isolated-same-correction-${run}`, reason: 'Isolated supported adjustment' };
    const result = await service.adjust(data.customerId, data.opening.documentId!, input, context());
    await expect(service.adjust(data.customerId, data.opening.documentId!, { ...input, expectedVersion: result.account.version }, context())).rejects.toEqual(code('CREDIT_EVIDENCE_CONFLICT'));
    expect((await statement(data.customerId)).account!.outstanding.amount).toBe('1010');
  });

  it('rejects receipt/correction evidence dated before the original debt', async () => {
    const data = await fixture();
    const before = new Date(Date.now() - 2 * 86_400_000).toISOString();
    await expect(service.adjust(data.customerId, data.opening.documentId!, { expectedVersion: data.opening.account.version, kind: 'DEBIT_ADJUSTMENT', amount: '1', effectiveAt: before, evidenceReference: 'isolated-invalid-chronology', reason: 'Invalid chronology' }, context())).rejects.toEqual(code('VALIDATION_ERROR'));
    await expect(service.receipt(data.customerId, { expectedVersion: data.opening.account.version, amount: '1', method: 'CASH', effectiveAt: before, evidenceReference: 'isolated-receipt-chronology', allocations: [{ documentId: data.opening.documentId!, amount: '1' }] }, context())).rejects.toEqual(code('VALIDATION_ERROR'));
  });

  it('financial book commands do not create orders/payments or modify stock', async () => {
    const before = await Promise.all([prisma.order.count(), prisma.payment.count(), prisma.inventoryMovement.count(), prisma.stockReservation.count()]);
    const data = await fixture(); await receive(data, '1');
    expect(await Promise.all([prisma.order.count(), prisma.payment.count(), prisma.inventoryMovement.count(), prisma.stockReservation.count()])).toEqual(before);
  });

  it('reports overdue and over-limit debt without inventing payments and permits evidence-backed repayment on a suspended account', async () => {
    const data = await fixture('1000', new Date(Date.now() - 1000).toISOString());
    const updated = await service.policy(data.customerId, { expectedVersion: data.opening.account.version, status: 'SUSPENDED', creditLimit: '100', termsDays: 60 }, context());
    expect(updated.account).toMatchObject({ overLimit: true, overdue: { amount: '1000' }, availableCredit: { amount: '0' } });
    expect((await statement(data.customerId)).documents[0]).toMatchObject({ status: 'OVERDUE', termsDays: 1 });
    const result = await receive(data, '1000', updated.account.version);
    expect(result.account).toMatchObject({ status: 'SUSPENDED', outstanding: { amount: '0' }, overdue: { amount: '0' } });
  });

  it('supports exact money beyond Number.MAX_SAFE_INTEGER and rejects BIGINT aggregate overflow atomically', async () => {
    const data = await fixture(MAX_CREDIT_IRR.toString());
    expect(data.opening.account.outstanding.amount).toBe(MAX_CREDIT_IRR.toString());
    await expect(service.adjust(data.customerId, data.opening.documentId!, { expectedVersion: data.opening.account.version, kind: 'DEBIT_ADJUSTMENT', amount: '1', effectiveAt: now(), evidenceReference: 'isolated-overflow', reason: 'Overflow must fail' }, context())).rejects.toEqual(code('VALIDATION_ERROR'));
    expect((await statement(data.customerId)).account!.outstanding.amount).toBe(MAX_CREDIT_IRR.toString());
  });

  it('resolves self ownership only by userId and does not disclose staff notes, evidence, phone or actor data', async () => {
    const a = await fixture(); const b = await fixture('2000');
    const self = await service.customerStatement(a.userId, { offset: 0, limit: 25 });
    expect(self.account!.customerId).toBe(a.customerId);
    expect(self.documents.map(item => item.id)).toEqual([a.opening.documentId]);
    expect(self.documents.some(item => item.id === b.opening.documentId)).toBe(false);
    const serialized = JSON.stringify(self);
    for (const field of ['sourceReference', 'evidenceReference', 'reason', 'actorId', 'requestId', 'mobile', 'email']) expect(serialized).not.toContain(field);
    expect(await service.customerStatement(actorId, { offset: 0, limit: 25 })).toMatchObject({ account: null, documents: [] });
    await expect(service.adjust(a.customerId, b.opening.documentId!, { expectedVersion: a.opening.account.version, kind: 'CREDIT_NOTE', amount: '1', effectiveAt: now(), evidenceReference: 'isolated-forged-id', reason: 'Cross-account access' }, context())).rejects.toEqual(code('CREDIT_NOT_FOUND'));
  });

  it('returns not-found for an unknown staff customer instead of reporting a successful empty account', async () => {
    await expect(statement(`missing-${run}`)).rejects.toEqual(code('CREDIT_NOT_FOUND'));
  });

  it('rejects duplicate allocations, allocation mismatch and empty/future evidence without writing financial rows', async () => {
    const data = await fixture();
    const base = { expectedVersion: data.opening.account.version, amount: '100', method: 'CASH' as const, effectiveAt: now(), evidenceReference: 'isolated-valid-reference', allocations: [{ documentId: data.opening.documentId!, amount: '100' }] };
    for (const input of [{ ...base, amount: '101' }, { ...base, evidenceReference: ' ' }, { ...base, effectiveAt: new Date(Date.now() + 86400000).toISOString() }, { ...base, amount: '200', allocations: [base.allocations[0], base.allocations[0]] }]) {
      await expect(service.receipt(data.customerId, input, context())).rejects.toEqual(code('VALIDATION_ERROR'));
    }
    expect(await prisma.creditReceipt.count({ where: { accountId: data.opening.account.id } })).toBe(0);
  });

  it('enforces UPDATE/DELETE immutability in PostgreSQL for documents, receipts and ledger entries', async () => {
    const data = await fixture(); const receipt = await receive(data, '10');
    await expect(prisma.receivableDocument.update({ where: { id: data.opening.documentId }, data: { amount: 10n } })).rejects.toThrow();
    await expect(prisma.receivableDocument.delete({ where: { id: data.opening.documentId } })).rejects.toThrow();
    await expect(prisma.creditReceipt.update({ where: { id: receipt.receiptId }, data: { amount: 1n } })).rejects.toThrow();
    await expect(prisma.creditReceipt.delete({ where: { id: receipt.receiptId } })).rejects.toThrow();
    await expect(prisma.creditLedgerEntry.update({ where: { id: receipt.entryIds![0] }, data: { amount: -1n } })).rejects.toThrow();
    await expect(prisma.creditLedgerEntry.delete({ where: { id: receipt.entryIds![0] } })).rejects.toThrow();
  });

  it('rejects an unallocated receipt and orphan debt document at transaction commit, including direct database writers', async () => {
    const data = await fixture();
    await expect(prisma.creditReceipt.create({ data: { accountId: data.opening.account.id, amount: 100n, method: 'CASH', evidenceReference: 'isolated-no-allocation', evidenceHash: run.padEnd(64, '0'), effectiveAt: new Date(now()), actorId, requestId: `credit-it-${run}` } })).rejects.toThrow();
    const other = await prisma.customer.create({ data: { mobile: `+989${String((Date.now() + 9) % 1_000_000_000).padStart(9, '0')}` } }); customers.push(other.id);
    const account = await service.policy(other.id, { expectedVersion: null, status: 'SUSPENDED', creditLimit: '0', termsDays: 0 }, context());
    await expect(prisma.receivableDocument.create({ data: { accountId: account.account.id, kind: 'OPENING_BALANCE', amount: 1n, issuedAt: new Date(now()), dueAt: new Date(now()), termsDays: 0, sourceReference: 'isolated-no-debit', actorId, requestId: `credit-it-${run}` } })).rejects.toThrow();
    expect((await statement(other.id)).total).toBe(0);
  });

  it('enforces document/receipt same-account foreign keys and reversal identity in PostgreSQL', async () => {
    const a = await fixture(); const b = await fixture(); const receipt = await receive(a, '10');
    const originalReceipt = await prisma.creditReceipt.findUniqueOrThrow({ where: { id: receipt.receiptId } });
    const base = { accountId: a.opening.account.id, documentId: b.opening.documentId!, receiptId: receipt.receiptId!, kind: 'RECEIPT' as const, amount: -1n, effectiveAt: originalReceipt.effectiveAt, actorId, requestId: `credit-it-${run}` };
    await expect(prisma.creditLedgerEntry.create({ data: base })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.creditLedgerEntry.create({ data: { ...base, documentId: a.opening.documentId!, kind: 'RECEIPT_REVERSAL', amount: 9n, reversalOfId: receipt.entryIds![0], reason: 'Mismatched reversal', evidenceReference: 'isolated-mismatch' } })).rejects.toThrow();
    expect((await statement(a.customerId)).account!.outstanding.amount).toBe('990');
  });

  it('records safe financial audit fields without raw operator evidence or mutation payloads', async () => {
    const data = await fixture(); const sensitiveEvidence = `private-source-do-not-log-${run}`; const sensitiveReason = `private-note-do-not-log-${run}`;
    await service.adjust(data.customerId, data.opening.documentId!, { expectedVersion: data.opening.account.version, kind: 'DEBIT_ADJUSTMENT', amount: '1', effectiveAt: now(), evidenceReference: sensitiveEvidence, reason: sensitiveReason }, context());
    const audits = await prisma.auditLog.findMany({ where: { requestId: `credit-it-${run}` } });
    const serialized = JSON.stringify(audits);
    expect(serialized).not.toContain(sensitiveEvidence); expect(serialized).not.toContain(sensitiveReason); expect(serialized).not.toContain(data.input.sourceReference);
    expect(audits.some(row => row.action === 'credit.document.adjusted')).toBe(true);
  });
});
