import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import type { CreditCancelRequest, CreditReturnRequest, CreditRefundPayoutRequest } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreditService } from './credit.service';
import { CreditReturnService } from './credit-return.service';

// These unit tests exercise the service decision boundary. Real commit, SQL,
// replay and concurrency acceptance remains in credit-sale.integration-spec.
function harness() {
  const item = { id: 'item-a', variantId: 'sku-a', quantity: 2, unitPrice: 1000n, total: 2000n };
  const order = { id: 'order-a', customerId: 'customer-a', version: 7, status: 'CREDIT_APPROVED', discount: 0n, shipping: 0n, grandTotal: 2000n,
    items: [item], fulfillment: { id: 'fulfillment-a', status: 'DELIVERED' }, shipment: { id: 'shipment-a' } as { id: string } | null,
    reservations: [{ variantId: 'sku-a', warehouseId: 'warehouse-a', locationId: 'location-a', quantity: 2, status: 'CONSUMED' }],
    receivableDocument: { id: 'document-a', accountId: 'account-a', entries: [{ id: 'sale-a', kind: 'SALE', amount: 2000n }] },
    creditReturns: [] as { id: string; entryId: string | null; lines: { orderItemId: string; quantity: number }[] }[] };
  const returnRow = { id: 'return-a', orderId: order.id, kind: 'RETURN', amount: 2000n, debtCredit: 1500n, refundDue: 500n,
    createdAt: new Date('2025-01-01T00:00:00Z'), lines: [{ orderItemId: item.id, quantity: 2, unitPrice: 1000n }],
    payouts: [{ amount: 100n }], evidenceReference: 'private-reference', reason: 'private-reason', actorId: 'private-actor', requestId: 'private-request' };
  const tx = {
    order: { findUnique: vi.fn(async () => order), findFirst: vi.fn(async () => ({ id: order.id })),
      update: vi.fn(async () => ({ id: order.id, version: 8 })), updateMany: vi.fn(async () => ({ count: 1 })) },
    warehouse: { findFirst: vi.fn(async () => ({ id: 'warehouse-a' })) },
    fulfillment: { updateMany: vi.fn(async () => ({ count: 1 })) },
    fulfillmentTransition: { findFirst: vi.fn(async () => ({ id: 'delivery-proof' })), create: vi.fn(async () => ({ id: 'transition' })) },
    orderTransition: { create: vi.fn(async () => ({ id: 'order-transition' })) },
    creditSaleReturn: { findMany: vi.fn(async () => [returnRow]), findFirst: vi.fn(async () => returnRow),
      findUnique: vi.fn(async (): Promise<{ id: string } | null> => null), create: vi.fn(async () => ({ id: 'return-a' })) },
    creditSaleReturnLine: { create: vi.fn(async () => ({})) },
    creditLedgerEntry: { create: vi.fn(async () => ({ id: 'note-a' })) },
    creditRefundPayout: { findUnique: vi.fn(async (): Promise<{ id: string } | null> => null), create: vi.fn(async () => ({ id: 'payout-a' })) },
  };
  const prisma = { $transaction: vi.fn(async (run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(tx as unknown as Prisma.TransactionClient)) };
  const credit = { account: vi.fn(async () => ({ id: 'account-a' })), summary: vi.fn(async () => ({ id: 'account-a', version: 4 })),
    executeCommand: vi.fn(async (_customer: string, _command: string, _payload: unknown, _context: unknown, run: (tx: Prisma.TransactionClient) => Promise<unknown>) => run(tx as unknown as Prisma.TransactionClient)) };
  const inventory = { changeOnHandIn: vi.fn(async () => ({ id: 'movement-a' })) }; const audit = { record: vi.fn(async () => undefined) };
  const service = new CreditReturnService(prisma as unknown as PrismaService, credit as unknown as CreditService, inventory as unknown as InventoryService, audit as unknown as AuditLogService);
  return { service, tx, order, returnRow, prisma, credit, inventory, audit };
}
const context = { actorId: 'staff-a', requestId: 'request-a', idempotencyKey: 'return-command-a' };
const input = (): CreditReturnRequest => ({ expectedVersion: 3, expectedOrderVersion: 7, evidenceReference: 'physical-receipt', reason: 'Actual sellable goods received',
  lines: [{ orderItemId: 'item-a', warehouseId: 'warehouse-a', locationId: 'location-a', quantity: 1 }] });
const payout = (): CreditRefundPayoutRequest => ({ expectedVersion: 3, amount: '200', method: 'BANK_TRANSFER', effectiveAt: '2025-01-02T00:00:00Z', evidenceReference: 'actual-transfer', reason: 'Actual refund transfer' });
const error = (code: string) => expect.objectContaining({ response: expect.objectContaining({ code }) });

describe('Credit return service financial, ownership and evidence decisions', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(() => { h = harness(); });
  const receive = (body = input()) => Promise.resolve().then(() => h.service.receive('customer-a', 'order-a', body, context));
  const pay = (body = payout()) => Promise.resolve().then(() => h.service.payout('customer-a', 'order-a', 'return-a', body, context));
  it('derives customer ownership from the authenticated user and projects no private evidence', async () => {
    const result = await h.service.customerList('customer-user-a', 'order-a');
    expect(h.tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ customer: { userId: 'customer-user-a', status: 'ACTIVE' } }) }));
    expect(result.items[0]).toMatchObject({ amount: { amount: '2000', currency: 'IRR' }, refunded: { amount: '100' }, refundRemaining: { amount: '400' }, lines: [{ unitPrice: { amount: '1000' } }] });
    for (const secret of ['private-reference','private-reason','private-actor','private-request']) expect(JSON.stringify(result)).not.toContain(secret);
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
  });
  it('rejects foreign customer reads and staff resource ownership mismatches', async () => {
    h.tx.order.findFirst.mockResolvedValueOnce(null as never);
    await expect(h.service.customerList('foreign-user', 'order-a')).rejects.toMatchObject(error('CREDIT_NOT_FOUND'));
    h.tx.order.findFirst.mockResolvedValueOnce(null as never);
    await expect(h.service.list('foreign-customer', 'order-a')).rejects.toMatchObject(error('CREDIT_NOT_FOUND'));
    expect(h.tx.creditSaleReturn.findMany).not.toHaveBeenCalled();
  });
  it('staff read uses both customer and order, bounded stable ordering and no payout evidence', async () => {
    await h.service.list('customer-a','order-a');
    expect(h.tx.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order-a', customerId: 'customer-a', receivableDocument: { isNot: null } } }));
    expect(h.tx.creditSaleReturn.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }));
  });
  it.each([{ expectedVersion: -1 }, { expectedOrderVersion: 1.5 }, { evidenceReference: '' }, { reason: 'bad\nreason' }, { evidenceReference: 'x'.repeat(129) }])('invalid version/evidence rejects before opening a command', async patch => {
    await expect(receive({ ...input(), ...patch })).rejects.toMatchObject(error('VALIDATION_ERROR'));
    expect(h.credit.executeCommand).not.toHaveBeenCalled();
  });
  it.each([[], [{ ...input().lines[0], quantity: 0 }], [{ ...input().lines[0], quantity: 1.5 }], [input().lines[0],input().lines[0]]])('invalid or duplicate return lines cannot post debt or stock', async lines => {
    await expect(receive({ ...input(), lines })).rejects.toMatchObject(error('CREDIT_RETURN_CONFLICT'));
    expect(h.credit.executeCommand).not.toHaveBeenCalled();
  });
  it.each(['owner','version','status','account','terms','delivery','adjustment','warehouse','quantity','price','evidence'])('fails closed for invalid %s before posting', async failure => {
    if (failure === 'owner') h.order.customerId = 'other';
    if (failure === 'version') h.order.version++;
    if (failure === 'status') h.order.status = 'PAID';
    if (failure === 'account') h.order.receivableDocument.accountId = 'other';
    if (failure === 'terms') h.order.discount = 1n;
    if (failure === 'delivery') h.tx.fulfillmentTransition.findFirst.mockResolvedValueOnce(null as never);
    if (failure === 'adjustment') h.order.receivableDocument.entries.push({ id: 'unlinked-note', kind: 'CREDIT_NOTE', amount: -1n });
    if (failure === 'warehouse') h.tx.warehouse.findFirst.mockResolvedValueOnce(null as never);
    if (failure === 'quantity') h.order.creditReturns.push({ id: 'previous', entryId: null, lines: [{ orderItemId: 'item-a', quantity: 2 }] });
    if (failure === 'price') h.order.items[0].total = 999n;
    if (failure === 'evidence') h.tx.creditSaleReturn.findUnique.mockResolvedValueOnce({ id: 'duplicate' });
    await expect(receive()).rejects.toMatchObject(error(failure === 'owner' ? 'CREDIT_NOT_FOUND' : failure === 'version' ? 'ORDER_VERSION_CONFLICT' : failure === 'evidence' ? 'CREDIT_EVIDENCE_CONFLICT' : 'CREDIT_RETURN_CONFLICT'));
    expect(h.tx.creditLedgerEntry.create).not.toHaveBeenCalled(); expect(h.inventory.changeOnHandIn).not.toHaveBeenCalled();
  });
  it('partial return uses original price, reduces unpaid debt and leaves delivered order active', async () => {
    const result = await receive(); expect(result.order?.status).toBe('CREDIT_APPROVED');
    expect(h.tx.creditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'CREDIT_NOTE', amount: -1000n }) }));
    expect(h.tx.creditSaleReturn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 1000n, debtCredit: 1000n, refundDue: 0n }) }));
    expect(h.inventory.changeOnHandIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ delta: 1, type: 'RETURN_IN', referenceType: 'credit-return', referenceId: 'return-a' }));
    expect(h.tx.orderTransition.create).not.toHaveBeenCalled();
    expect(h.audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ amount: '1000', refundDue: '0' }) }), expect.anything());
    const logged = JSON.stringify(h.audit.record.mock.calls); expect(logged).not.toContain('physical-receipt'); expect(logged).not.toContain('Actual sellable goods');
  });
  it('collected amount becomes a refund liability, never a fake completed payout', async () => {
    h.order.receivableDocument.entries.push({ id: 'receipt', kind: 'RECEIPT', amount: -1500n });
    await receive(); expect(h.tx.creditSaleReturn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ debtCredit: 500n, refundDue: 500n }) }));
    expect(h.tx.creditRefundPayout.create).not.toHaveBeenCalled();
  });
  it('fully returned paid-through-receipts goods close states without a zero ledger posting', async () => {
    h.order.receivableDocument.entries.push({ id: 'receipt', kind: 'RECEIPT', amount: -2000n });
    const result = await receive({ ...input(), lines: [{ ...input().lines[0], quantity: 2 }] });
    expect(result.order?.status).toBe('RETURNED'); expect(h.tx.creditLedgerEntry.create).not.toHaveBeenCalled();
    expect(h.tx.orderTransition.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ from: 'CREDIT_APPROVED', to: 'RETURNED' }) }));
  });
  it('free goods preserve physical quantity evidence while creating no fake credit amount', async () => {
    h.order.items.push({ id: 'gift', variantId: 'gift-sku', quantity: 1, unitPrice: 0n, total: 0n });
    await receive({ ...input(), lines: [{ ...input().lines[0], orderItemId: 'gift' }] });
    expect(h.tx.creditSaleReturn.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 0n, debtCredit: 0n, entryId: undefined }) }));
    expect(h.tx.creditLedgerEntry.create).not.toHaveBeenCalled(); expect(h.tx.orderTransition.create).not.toHaveBeenCalled();
    expect(h.inventory.changeOnHandIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ variantId: 'gift-sku', delta: 1 }));
  });
  it('cancellation restores consumed reservations to their original locations', async () => {
    h.order.shipment = null; h.order.fulfillment.status = 'READY_TO_SHIP';
    const { expectedVersion, expectedOrderVersion, evidenceReference, reason } = input();
    const body = { expectedVersion, expectedOrderVersion, evidenceReference, reason };
    const result = await h.service.cancel('customer-a','order-a', body as CreditCancelRequest, context);
    expect(result.order?.status).toBe('CANCELLED');
    expect(h.inventory.changeOnHandIn).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ warehouseId: 'warehouse-a', locationId: 'location-a', delta: 2 }));
  });
  it('cancellation cannot restock shipped goods or missing consumed reservations', async () => {
    const { expectedVersion, expectedOrderVersion, evidenceReference, reason } = input();
    const body = { expectedVersion, expectedOrderVersion, evidenceReference, reason };
    await expect(Promise.resolve().then(() => h.service.cancel('customer-a','order-a',body,context))).rejects.toMatchObject(error('CREDIT_RETURN_CONFLICT'));
    h.order.shipment = null; h.order.fulfillment.status = 'PENDING'; h.order.reservations[0].status = 'RELEASED';
    await expect(Promise.resolve().then(() => h.service.cancel('customer-a','order-a',body,context))).rejects.toMatchObject(error('CREDIT_RETURN_CONFLICT'));
    expect(h.inventory.changeOnHandIn).not.toHaveBeenCalled();
  });
  it.each([{ amount: '0' }, { amount: '1.5' }, { effectiveAt: '2025-02-30T00:00:00Z' }, { effectiveAt: '2025-01-02T00:00:00' }, { effectiveAt: '2999-01-01T00:00:00Z' }])('invalid payout money or timestamp cannot record success', async patch => {
    await expect(pay({ ...payout(), ...patch })).rejects.toBeDefined(); expect(h.tx.creditRefundPayout.create).not.toHaveBeenCalled();
  });
  it.each(['owner','ceiling','before','duplicate'])('payout rejects %s without recorded delivery', async failure => {
    if (failure === 'owner') h.tx.creditSaleReturn.findFirst.mockResolvedValueOnce(null as never);
    if (failure === 'ceiling') h.returnRow.payouts.push({ amount: 399n });
    if (failure === 'before') h.returnRow.createdAt = new Date('2025-01-03T00:00:00Z');
    if (failure === 'duplicate') h.tx.creditRefundPayout.findUnique.mockResolvedValueOnce({ id: 'already-recorded' });
    await expect(pay()).rejects.toMatchObject(error(failure === 'owner' ? 'CREDIT_NOT_FOUND' : failure === 'duplicate' ? 'CREDIT_EVIDENCE_CONFLICT' : 'CREDIT_RETURN_CONFLICT'));
    expect(h.tx.creditRefundPayout.create).not.toHaveBeenCalled();
  });
  it('manual payout is owned, bounded, order-scoped on replay and privately evidenced', async () => {
    const result = await pay(); expect(result.payoutId).toBe('payout-a');
    expect(h.tx.creditSaleReturn.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'return-a', orderId: 'order-a', document: { accountId: 'account-a' }, order: { customerId: 'customer-a' } } }));
    expect(h.credit.executeCommand).toHaveBeenCalledWith('customer-a', 'refund:return-a', expect.objectContaining({ orderId: 'order-a' }), context, expect.any(Function), 'order-a');
    expect(h.tx.creditRefundPayout.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 200n, method: 'BANK_TRANSFER', evidenceReference: 'actual-transfer' }) }));
    expect(JSON.stringify(h.audit.record.mock.calls)).not.toContain('actual-transfer');
    expect(h.tx.creditLedgerEntry.create).not.toHaveBeenCalled(); expect(h.inventory.changeOnHandIn).not.toHaveBeenCalled();
  });
});
