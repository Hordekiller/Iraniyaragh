import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreditCommandResult, CreditSaleApprovalRequest } from '@iranyaragh/contracts';
import { recordTransition } from '../../common/state-machine';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreditService, creditAmount, type CreditContext } from './credit.service';

const conflict = (code: string, message: string) => new ConflictException({ code, message });
@Injectable()
export class CreditSaleService {
  constructor(private readonly credit: CreditService, private readonly inventory: InventoryService, private readonly audit: AuditLogService) {}

  async approve(customerId: string, orderId: string, input: CreditSaleApprovalRequest, context: CreditContext): Promise<CreditCommandResult> {
    if (!Number.isInteger(input.expectedOrderVersion) || input.expectedOrderVersion < 0 || input.expectedOrderVersion > 2_147_483_647) {
      throw conflict('ORDER_VERSION_CONFLICT', 'A valid order version is required.');
    }
    return this.credit.executeCommand(customerId, `sale:${orderId}`, input, context, async tx => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: {
        customer: { select: { status: true } }, items: true,
        payments: { select: { id: true } }, staffCommandRecords: { select: { id: true }, take: 1 },
        fulfillment: { select: { id: true } },
        reservations: { include: { warehouse: { select: { isActive: true } }, location: { select: { isActive: true } } } },
      } });
      if (!order || order.customerId !== customerId) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Staff order not found for this customer.' });
      if (order.version !== input.expectedOrderVersion) throw conflict('ORDER_VERSION_CONFLICT', 'Order changed; reload before approving credit.');
      if (order.status !== 'PENDING_PAYMENT' || order.staffCommandRecords.length !== 1 || order.fulfillment) throw conflict('CREDIT_SALE_CONFLICT', 'Only an unfulfilled pending staff order can receive credit approval.');
      // A failed or ambiguous authorization may still settle externally. Never convert it to credit.
      if (order.payments.length) throw conflict('CREDIT_PAYMENT_CONFLICT', 'An order with any payment attempt cannot be converted to credit.');
      const account = await this.credit.account(tx, customerId, input.expectedVersion);
      const summary = await this.credit.summary(tx, account.id);
      if (account.status !== 'ACTIVE' || order.customer.status !== 'ACTIVE') throw conflict('CREDIT_ACCOUNT_INACTIVE', 'Customer credit is not active.');
      if (BigInt(summary.overdue.amount) > 0n) throw conflict('CREDIT_OVERDUE', 'Overdue debt must be reconciled before a new credit sale.');
      const amount = creditAmount(order.grandTotal.toString());
      if (amount > BigInt(summary.availableCredit.amount)) throw conflict('CREDIT_LIMIT_EXCEEDED', 'This sale exceeds the available customer credit.');
      const issuedAt = new Date();
      if (order.reservationExpiresAt <= issuedAt || order.items.length === 0 || order.reservations.length === 0 || order.reservations.some(row => row.status !== 'ACTIVE' || row.expiresAt <= issuedAt || !row.warehouse.isActive || !row.location.isActive)) {
        throw conflict('RESERVATION_EXPIRED', 'Every credit-sale reservation must still be active and unexpired.');
      }
      const reserved = new Map<string, number>();
      for (const row of order.reservations) reserved.set(row.variantId, (reserved.get(row.variantId) ?? 0) + row.quantity);
      const ordered = new Map<string, number>();
      for (const item of order.items) ordered.set(item.variantId, (ordered.get(item.variantId) ?? 0) + item.quantity);
      if (reserved.size !== ordered.size || [...ordered].some(([id, quantity]) => reserved.get(id) !== quantity)) throw conflict('CREDIT_SALE_CONFLICT', 'Reservations do not exactly match the ordered SKUs and quantities.');
      const document = await tx.receivableDocument.create({ data: {
        accountId: account.id, orderId, kind: 'SALE', amount, issuedAt,
        dueAt: new Date(issuedAt.getTime() + account.termsDays * 86_400_000), termsDays: account.termsDays,
        sourceReference: order.number, actorId: context.actorId, requestId: context.requestId,
      } });
      const entry = await tx.creditLedgerEntry.create({ data: { accountId: account.id, documentId: document.id, kind: 'SALE', amount, effectiveAt: issuedAt, actorId: context.actorId, requestId: context.requestId } });
      await this.inventory.consumeReservationsForOrder(tx, orderId, context);
      await tx.fulfillment.create({ data: { orderId, status: 'PENDING' } });
      const transition = await recordTransition(tx, 'order', orderId, 'PENDING_PAYMENT', 'CREDIT_APPROVED', { actorId: context.actorId, requestId: context.requestId, reason: 'STAFF_CREDIT_APPROVAL' });
      const updated = await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } }, select: { id: true, version: true } });
      await this.audit.record({ action: 'credit.sale.approved', entityType: 'order', entityId: orderId, actorId: context.actorId, requestId: context.requestId,
        metadata: { accountId: account.id, documentId: document.id, transitionId: transition.id, amount: amount.toString(), termsDays: account.termsDays } }, tx);
      return { account: await this.credit.summary(tx, account.id), order: { ...updated, status: 'CREDIT_APPROVED' }, documentId: document.id, entryIds: [entry.id] };
    }, orderId);
  }
}
