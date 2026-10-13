import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { CreditCancelRequest, CreditCommandResult, CreditRefundPayoutRequest, CreditReturnRequest, CreditSaleReturns } from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { recordTransition } from '../../common/state-machine';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreditService, creditAmount, type CreditContext } from './credit.service';

const conflict = (message: string) => new ConflictException({ code: 'CREDIT_RETURN_CONFLICT', message });
const missing = () => new NotFoundException({ code: 'CREDIT_NOT_FOUND', message: 'Credit sale or return not found for this customer.' });
const money = (amount: bigint) => ({ amount: amount.toString(), currency: 'IRR' as const });
function evidence(value: string, maximum: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || [...value].some(character => { const code = character.codePointAt(0)!; return code < 32 || code === 127; })) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A bounded private evidence reference and reason are required.' });
  return value.trim().normalize('NFC');
}
function hash(...values: string[]) { return createHash('sha256').update(JSON.stringify(values)).digest('hex'); }
function version(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A valid version is required.' });
}

@Injectable()
export class CreditReturnService {
  constructor(private readonly prisma: PrismaService, private readonly credit: CreditService, private readonly inventory: InventoryService, private readonly audit: AuditLogService) {}

  async list(customerId: string, orderId: string): Promise<CreditSaleReturns> {
    return this.prisma.$transaction(async tx => {
      if (!await tx.order.findFirst({ where: { id: orderId, customerId, receivableDocument: { isNot: null } }, select: { id: true } })) throw missing();
      return this.listIn(tx, orderId);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async customerList(userId: string, orderId: string): Promise<CreditSaleReturns> {
    return this.prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id: orderId, customer: { userId, status: 'ACTIVE' }, receivableDocument: { isNot: null } }, select: { id: true } });
      if (!order) throw missing();
      return this.listIn(tx, orderId);
    }, { isolationLevel: 'RepeatableRead' });
  }
  private async listIn(tx: Prisma.TransactionClient, orderId: string): Promise<CreditSaleReturns> {
    const rows = await tx.creditSaleReturn.findMany({ where: { orderId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100,
      select: { id: true, orderId: true, kind: true, amount: true, debtCredit: true, refundDue: true, createdAt: true,
        lines: { select: { orderItemId: true, quantity: true, unitPrice: true }, orderBy: { id: 'asc' } }, payouts: { select: { amount: true } } } });
    return { items: rows.map(row => { const refunded = row.payouts.reduce((sum, item) => sum + item.amount, 0n);
      return { id: row.id, orderId, kind: row.kind as 'CANCEL' | 'RETURN', amount: money(row.amount), debtCredit: money(row.debtCredit), refundDue: money(row.refundDue), refunded: money(refunded), refundRemaining: money(row.refundDue - refunded), createdAt: row.createdAt.toISOString(), lines: row.lines.map(line => ({ ...line, unitPrice: money(line.unitPrice) })) };
    }) };
  }
  cancel(customerId: string, orderId: string, input: CreditCancelRequest, context: CreditContext): Promise<CreditCommandResult> {
    return this.compensate(customerId, orderId, 'CANCEL', input, context);
  }
  receive(customerId: string, orderId: string, input: CreditReturnRequest, context: CreditContext): Promise<CreditCommandResult> {
    return this.compensate(customerId, orderId, 'RETURN', input, context);
  }
  private async compensate(customerId: string, orderId: string, kind: 'CANCEL' | 'RETURN', input: CreditCancelRequest | CreditReturnRequest, context: CreditContext): Promise<CreditCommandResult> {
    version(input.expectedVersion); version(input.expectedOrderVersion);
    const reference = evidence(input.evidenceReference, 128); const reason = evidence(input.reason, 500);
    let requested: CreditReturnRequest['lines'] = [];
    if (kind === 'RETURN') {
      const lines = (input as CreditReturnRequest).lines;
      if (!Array.isArray(lines) || lines.length < 1 || lines.length > 50) throw conflict('Return 1–50 real order lines.');
      requested = lines.map(line => ({ orderItemId: evidence(line.orderItemId, 128), warehouseId: evidence(line.warehouseId, 128), locationId: evidence(line.locationId, 128), quantity: line.quantity })).sort((a, b) => a.orderItemId < b.orderItemId ? -1 : a.orderItemId > b.orderItemId ? 1 : 0);
      if (new Set(requested.map(line => line.orderItemId)).size !== requested.length || requested.some(line => !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000)) throw conflict('Return quantities must be bounded positive integers and line IDs distinct.');
    }
    const payload = { ...input, evidenceReference: reference, reason, ...(kind === 'RETURN' ? { lines: requested } : {}) };
    return this.credit.executeCommand(customerId, `return:${kind}:${orderId}`, payload, context, async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, receivableDocument: { include: { entries: true } }, fulfillment: true, shipment: true, reservations: true, creditReturns: { include: { lines: true } } } });
      if (!order || order.customerId !== customerId || !order.receivableDocument) throw missing();
      if (order.version !== input.expectedOrderVersion) throw new ConflictException({ code: 'ORDER_VERSION_CONFLICT', message: 'Order changed; reload before compensation.' });
      const account = await this.credit.account(tx, customerId, input.expectedVersion);
      const document = order.receivableDocument;
      if (document.accountId !== account.id || order.status !== 'CREDIT_APPROVED' || !order.fulfillment || order.discount !== 0n || order.shipping !== 0n) throw conflict('Only a reconciled staff credit sale with its original zero-discount pickup terms can be compensated.');
      if (order.creditReturns.length >= 100) throw conflict('Maximum return documents reached; financial reconciliation is required.');
      const linkedNotes = new Set(order.creditReturns.map(row => row.entryId).filter(Boolean));
      if (document.entries.some(entry => entry.kind === 'DEBIT_ADJUSTMENT' || (entry.kind === 'CREDIT_NOTE' && !linkedNotes.has(entry.id)))) throw conflict('Reconcile unrelated financial adjustments before returning goods.');
      let lines = requested;
      if (kind === 'CANCEL') {
        if (order.shipment || !['PENDING', 'PROCESSING', 'READY_TO_SHIP'].includes(order.fulfillment.status) || order.creditReturns.length) throw conflict('Cancellation is permitted only before dispatch and before any return.');
        lines = order.reservations.map(reservation => {
          const item = order.items.find(item => item.variantId === reservation.variantId);
          if (!item || reservation.status !== 'CONSUMED') throw conflict('Original consumed reservation evidence is missing.');
          return { orderItemId: item.id, quantity: reservation.quantity, warehouseId: reservation.warehouseId, locationId: reservation.locationId };
        });
      } else if (order.fulfillment.status !== 'DELIVERED' || !order.shipment || !await tx.fulfillmentTransition.findFirst({ where: { fulfillmentId: order.fulfillment.id, from: 'SHIPPED', to: 'DELIVERED', reason: { startsWith: 'STAFF_DELIVERY_PROOF:' } }, select: { id: true } })) throw conflict('Receive returned goods only after authoritative delivery.');
      const returned = new Map<string, number>();
      for (const previous of order.creditReturns) for (const line of previous.lines) returned.set(line.orderItemId, (returned.get(line.orderItemId) ?? 0) + line.quantity);
      let amount = 0n;
      for (const line of lines) {
        if (!await tx.warehouse.findFirst({ where: { id: line.warehouseId, isActive: true }, select: { id: true } })) throw conflict('Return destination warehouse must be active.');
        const item = order.items.find(item => item.id === line.orderItemId);
        if (!item || item.total !== item.unitPrice * BigInt(item.quantity) || item.unitPrice < 0n) throw conflict('The return line does not match immutable sale terms.');
        const totalQuantity = (returned.get(item.id) ?? 0) + line.quantity;
        if (totalQuantity > item.quantity) throw conflict('Returned quantities exceed the original sale.');
        returned.set(item.id, totalQuantity); amount += item.unitPrice * BigInt(line.quantity);
      }
      if (amount < 0n || amount > order.grandTotal || order.items.reduce((sum, item) => sum + item.total, 0n) !== order.grandTotal) throw conflict('Sale totals do not reconcile.');
      const outstanding = document.entries.reduce((sum, entry) => sum + entry.amount, 0n);
      const debtCredit = amount < outstanding ? amount : outstanding;
      const refundDue = amount - debtCredit;
      const returnEvidenceHash = hash('credit-return', account.id, reference.normalize('NFKC').toUpperCase());
      if (await tx.creditSaleReturn.findUnique({ where: { evidenceHash: returnEvidenceHash }, select: { id: true } })) throw new ConflictException({ code: 'CREDIT_EVIDENCE_CONFLICT', message: 'Return evidence already recorded.' });
      const effectiveAt = new Date();
      const entry = debtCredit > 0n ? await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId: document.id, kind: 'CREDIT_NOTE', amount: -debtCredit, effectiveAt, evidenceReference: reference, reason, evidenceHash: hash('return-credit', account.id, reference.normalize('NFKC').toUpperCase()), actorId: context.actorId, requestId: context.requestId } }) : null;
      const record = await tx.creditSaleReturn.create({ data: { orderId, documentId: document.id, kind, amount, debtCredit, refundDue, entryId: entry?.id, evidenceReference: reference, evidenceHash: returnEvidenceHash, reason, actorId: context.actorId, requestId: context.requestId } });
      // Deterministic warehouse/location/SKU ordering avoids lock inversion with transfers.
      lines = [...lines].sort((a, b) => {
        const aa = `${a.warehouseId}:${a.locationId}:${order.items.find(item => item.id === a.orderItemId)!.variantId}`, bb = `${b.warehouseId}:${b.locationId}:${order.items.find(item => item.id === b.orderItemId)!.variantId}`;
        return aa < bb ? -1 : aa > bb ? 1 : 0;
      });
      for (const [index, line] of lines.entries()) {
        const item = order.items.find(item => item.id === line.orderItemId)!;
        const movement = await this.inventory.changeOnHandIn(tx, { ...context, warehouseId: line.warehouseId, locationId: line.locationId, variantId: item.variantId, delta: line.quantity, type: 'RETURN_IN', referenceType: 'credit-return', referenceId: record.id, reason: 'CREDIT_SALE_COMPENSATION', idempotencyKey: hash('credit-return-stock', record.id, String(index)) });
        await tx.creditSaleReturnLine.create({ data: { returnId: record.id, orderItemId: item.id, quantity: line.quantity, unitPrice: item.unitPrice, movementId: movement.id } });
      }
      const complete = order.items.every(item => returned.get(item.id) === item.quantity);
      const status = complete ? kind === 'CANCEL' ? 'CANCELLED' : 'RETURNED' : 'CREDIT_APPROVED';
      if (complete) {
        await recordTransition(tx, 'fulfillment', order.fulfillment.id, order.fulfillment.status, status, { ...context, reason: 'CREDIT_SALE_COMPENSATION' });
        await recordTransition(tx, 'order', orderId, 'CREDIT_APPROVED', status, { ...context, reason: 'CREDIT_SALE_COMPENSATION' });
      }
      const updated = await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } }, select: { id: true, version: true } });
      await this.audit.record({ action: 'credit.sale.compensated', entityType: 'order', entityId: orderId, actorId: context.actorId, requestId: context.requestId, metadata: { returnId: record.id, documentId: document.id, kind, amount: amount.toString(), debtCredit: debtCredit.toString(), refundDue: refundDue.toString(), lineCount: lines.length } }, tx);
      return { account: await this.credit.summary(tx, account.id), order: { ...updated, status }, documentId: document.id, returnId: record.id, entryIds: entry ? [entry.id] : [] };
    }, orderId);
  }

  async payout(customerId: string, orderId: string, returnId: string, input: CreditRefundPayoutRequest, context: CreditContext): Promise<CreditCommandResult> {
    version(input.expectedVersion); const amount = creditAmount(input.amount);
    const reference = evidence(input.evidenceReference, 128); const reason = evidence(input.reason, 500);
    const effectiveAt = new Date(input.effectiveAt);
    const calendar = new Date(`${input.effectiveAt?.slice(0, 19)}Z`);
    if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0,19) !== input.effectiveAt?.slice(0,19)) throw conflict('Invalid payout calendar timestamp.');
    if (!['CASH', 'BANK_TRANSFER'].includes(input.method) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/u.test(input.effectiveAt) || !Number.isFinite(effectiveAt.getTime()) || effectiveAt.getTime() > Date.now()) throw conflict('A supported payout method and actual past transfer timestamp are required.');
    return this.credit.executeCommand(customerId, `refund:${returnId}`, { ...input, orderId, evidenceReference: reference, reason }, context, async tx => {
      const account = await this.credit.account(tx, customerId, input.expectedVersion);
      const record = await tx.creditSaleReturn.findFirst({ where: { id: returnId, orderId, document: { accountId: account.id }, order: { customerId } }, include: { payouts: true } });
      if (!record) throw missing();
      if (effectiveAt < record.createdAt || amount > record.refundDue - record.payouts.reduce((sum, payout) => sum + payout.amount, 0n)) throw conflict('Payout must not precede the return or exceed its remaining refund liability.');
      const payoutEvidenceHash = hash('credit-refund-payout', input.method, reference.normalize('NFKC').toUpperCase());
      if (await tx.creditRefundPayout.findUnique({ where: { evidenceHash: payoutEvidenceHash }, select: { id: true } })) throw new ConflictException({ code: 'CREDIT_EVIDENCE_CONFLICT', message: 'Payout evidence already recorded.' });
      const payout = await tx.creditRefundPayout.create({ data: { returnId, amount, method: input.method, effectiveAt, evidenceReference: reference, evidenceHash: payoutEvidenceHash, reason, actorId: context.actorId, requestId: context.requestId } });
      await this.audit.record({ action: 'credit.refund.payout_recorded', entityType: 'credit-return', entityId: returnId, actorId: context.actorId, requestId: context.requestId, metadata: { payoutId: payout.id, amount: amount.toString(), method: input.method } }, tx);
      return { account: await this.credit.summary(tx, account.id), returnId, payoutId: payout.id };
    }, orderId);
  }
}
