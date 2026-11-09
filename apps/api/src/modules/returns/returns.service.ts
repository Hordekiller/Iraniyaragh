import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  OrderReturnView,
  ReturnsPublicConfig,
  ReturnsSettings,
  ReturnsSettingsUpdate,
  ReturnCreateRequest,
  ReturnDisposition,
  ReturnEligibility,
  ReturnHolidayView,
  ReturnIneligibleReason,
  ReturnListResponse,
  ReturnRefundRequest,
  ReturnRefundResponse,
  ReturnResponse,
  ReturnWindowKind,
} from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { withSerializableRetry } from '../../common/serializable-retry';
import { recordTransition } from '../../common/state-machine';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { AdminPaymentRefundService } from '../payments/admin-payment-refund.service';
import { STAFF_PICKUP_POLICY } from '../orders/staff-pickup-policy';
import { storeShipmentCommandReplay } from '../orders/shipment-command-utils';
import {
  allocateNetByLine,
  incrementalLineRefund,
  ReturnAmountError,
  shippingRefund,
  type PricedLine,
} from './return-amounts';
import {
  civilKey,
  computeReturnDeadline,
  isWithinReturnWindow,
  parseCivilKey,
  RETURN_POLICY_REVISION,
} from './return-window';

export type ReturnContext = Readonly<{ actorId: string; requestId: string; idempotencyKey: string }>;

/** Key of the admin switch in StorefrontFeatureFlag. Returns are OFF until an administrator enables them. */
export const RETURNS_FLAG = 'order-returns';
export const RETURNS_DEFAULT_ENABLED = false;
const SETTINGS_LOCK: readonly [number, number] = [1_920_164_001, 1_920_164_002];
const CREATE_SCOPE = 'order.return:create';
const MAX_HOLIDAYS = 2000;
const DISPOSITIONS: ReadonlySet<string> = new Set(['RESTOCK', 'DAMAGED', 'NOT_RETURNED']);

const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const money = (amount: bigint) => ({ amount: amount.toString(), currency: 'IRR' as const });
const hasControl = (value: string) => [...value].some((character) => { const code = character.codePointAt(0) ?? 0; return code < 32 || code === 127; });

const invalid = (message: string) => new BadRequestException({ code: 'RETURN_INPUT_INVALID', message });
const notFound = () => new NotFoundException({ code: 'RETURN_NOT_FOUND', message: 'Order or return not found.' });
const notEligible = (reason: ReturnIneligibleReason) =>
  new ConflictException({ code: 'RETURN_NOT_ELIGIBLE', message: `This order cannot receive a return: ${reason}.`, details: { reason } });

function text(value: unknown, maximum: number, label: string, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw invalid(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') throw invalid(`${label} must be text.`);
  const normalized = value.normalize('NFC').trim();
  if (!normalized) {
    if (required) throw invalid(`${label} is required.`);
    return null;
  }
  if (normalized.length > maximum || hasControl(normalized)) throw invalid(`${label} is too long or contains control characters.`);
  return normalized;
}

type OrderForReturn = Prisma.OrderGetPayload<{
  select: {
    id: true; number: true; status: true; subtotal: true; discount: true; shipping: true; grandTotal: true; shippingMethod: true;
    items: { select: { id: true; variantId: true; ordinal: true; sku: true; title: true; quantity: true; unitPrice: true; total: true } };
    payments: { select: { id: true; status: true; amount: true } };
    invoiceDocument: { select: { id: true; issuedAt: true } };
    customDoorOrder: { select: { id: true } };
    fulfillment: { select: { id: true; status: true } };
    returns: { select: { sequence: true; lines: { select: { orderItemId: true; quantity: true } } } };
  };
}>;

const orderSelect = {
  id: true, number: true, status: true, subtotal: true, discount: true, shipping: true, grandTotal: true, shippingMethod: true,
  items: { orderBy: { ordinal: 'asc' }, select: { id: true, variantId: true, ordinal: true, sku: true, title: true, quantity: true, unitPrice: true, total: true } },
  payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] } }, select: { id: true, status: true, amount: true } },
  invoiceDocument: { select: { id: true, issuedAt: true } },
  customDoorOrder: { select: { id: true } },
  fulfillment: { select: { id: true, status: true } },
  returns: { select: { sequence: true, lines: { select: { orderItemId: true, quantity: true } } } },
} satisfies Prisma.OrderSelect;

type Evaluation = {
  order: OrderForReturn;
  eligibility: ReturnEligibility;
  windowKind: ReturnWindowKind | null;
  deadline: Date | null;
  returnedByItem: Map<string, number>;
  netByItem: Map<string, bigint> | null;
  pricedLines: PricedLine[];
};

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(AdminPaymentRefundService) private readonly refunds: AdminPaymentRefundService,
  ) {}

  // ---------------------------------------------------------------------------
  // Eligibility
  // ---------------------------------------------------------------------------

  async eligibility(orderId: string): Promise<{ data: ReturnEligibility }> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, select: orderSelect });
      if (!order) throw notFound();
      return { data: (await this.evaluate(tx, order, new Date())).eligibility };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  // ---------------------------------------------------------------------------
  // On/off switch (settings.manage). Off blocks recording NEW returns only:
  // reading returns and recording the refund of an already recorded return stay
  // possible, because money owed to a customer must never be locked by a switch.
  // ---------------------------------------------------------------------------

  private async isEnabled(tx: Prisma.TransactionClient): Promise<boolean> {
    const row = await tx.storefrontFeatureFlag.findUnique({ where: { key: RETURNS_FLAG }, select: { enabled: true } });
    return row?.enabled ?? RETURNS_DEFAULT_ENABLED;
  }

  private project(row: { enabled: boolean; version: number; updatedAt: Date } | null): ReturnsSettings {
    return { enabled: row?.enabled ?? RETURNS_DEFAULT_ENABLED, version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  async readSettings(): Promise<{ data: ReturnsSettings }> {
    return { data: this.project(await this.prisma.storefrontFeatureFlag.findUnique({ where: { key: RETURNS_FLAG } })) };
  }

  async readPublicConfig(): Promise<{ data: ReturnsPublicConfig }> {
    return { data: { enabled: (await this.readSettings()).data.enabled } };
  }

  async updateSettings(actorId: string, requestId: string, input: ReturnsSettingsUpdate): Promise<{ data: ReturnsSettings }> {
    if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0 || typeof input.enabled !== 'boolean') {
      throw invalid('expectedVersion and enabled are required.');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETTINGS_LOCK[0]}::int, ${SETTINGS_LOCK[1]}::int)`;
      const current = await tx.storefrontFeatureFlag.findUnique({ where: { key: RETURNS_FLAG } });
      if ((current?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException({ code: 'RETURN_SETTINGS_STALE', message: 'The returns setting changed; reload before saving.' });
      }
      const before = this.project(current);
      const row = current
        ? await tx.storefrontFeatureFlag.update({ where: { key: RETURNS_FLAG }, data: { enabled: input.enabled, version: current.version + 1 } })
        : await tx.storefrontFeatureFlag.create({ data: { key: RETURNS_FLAG, enabled: input.enabled, version: 1 } });
      const after = this.project(row);
      await this.audit.record({ action: 'returns.settings.updated', entityType: 'storefront_feature_flag', entityId: RETURNS_FLAG, actorId, requestId, before, after }, tx);
      return { data: after };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }

  private async windowKind(tx: Prisma.TransactionClient, methodCode: string): Promise<ReturnWindowKind | null> {
    if (methodCode === STAFF_PICKUP_POLICY.code) return 'IN_PERSON';
    const method = await tx.shippingMethod.findUnique({ where: { code: methodCode }, select: { returnWindowKind: true } });
    return method?.returnWindowKind ?? null;
  }

  private async holidays(tx: Prisma.TransactionClient): Promise<ReadonlySet<string>> {
    const rows = await tx.returnHoliday.findMany({ select: { dateKey: true }, take: MAX_HOLIDAYS });
    return new Set(rows.map((row) => row.dateKey));
  }

  /** Every rule is evaluated from persisted facts; nothing is inferred or defaulted. */
  private async evaluate(tx: Prisma.TransactionClient, order: OrderForReturn, now: Date): Promise<Evaluation> {
    const returnedByItem = new Map<string, number>();
    for (const previous of order.returns) {
      for (const line of previous.lines) returnedByItem.set(line.orderItemId, (returnedByItem.get(line.orderItemId) ?? 0) + line.quantity);
    }
    const pricedLines: PricedLine[] = order.items.map((item) => ({
      orderItemId: item.id, ordinal: item.ordinal, quantity: item.quantity, unitPrice: item.unitPrice, total: item.total,
    }));

    let netByItem: Map<string, bigint> | null = null;
    let reconciles = false;
    try {
      netByItem = allocateNetByLine(pricedLines, order.discount);
      reconciles = order.subtotal === pricedLines.reduce((sum, line) => sum + line.total, 0n)
        && order.grandTotal === order.subtotal - order.discount + order.shipping;
    } catch (error) {
      if (!(error instanceof ReturnAmountError)) throw error;
    }

    const windowKind = await this.windowKind(tx, order.shippingMethod);
    const issuedAt = order.invoiceDocument?.issuedAt ?? null;
    const deadline = windowKind && issuedAt
      ? computeReturnDeadline({ kind: windowKind, anchor: issuedAt, holidays: await this.holidays(tx) })
      : null;

    const settled = order.payments.filter((payment) => payment.status === 'PAID' || payment.status === 'PARTIALLY_REFUNDED');
    const enabled = await this.isEnabled(tx);
    let reason: ReturnIneligibleReason | null = null;
    const everythingReturned = order.items.length > 0 && order.items.every((item) => (returnedByItem.get(item.id) ?? 0) >= item.quantity);
    if (!enabled) reason = 'RETURNS_DISABLED';
    else if (order.status === 'RETURNED' || everythingReturned) reason = 'FULLY_RETURNED';
    else if (order.status !== 'PAID') reason = 'ORDER_NOT_PAID';
    else if (order.customDoorOrder) reason = 'CUSTOM_DOOR_EXCLUDED';
    else if (settled.length === 0) reason = 'PAYMENT_NOT_SETTLED';
    else if (!reconciles || order.payments.length !== 1 || settled[0]!.amount !== order.grandTotal) reason = 'AMOUNTS_DO_NOT_RECONCILE';
    else if (!order.invoiceDocument) reason = 'NO_ISSUED_INVOICE';
    else if (!windowKind) reason = 'METHOD_UNCLASSIFIED';
    else if (deadline && !isWithinReturnWindow(now, deadline)) reason = 'WINDOW_CLOSED';

    const eligibility: ReturnEligibility = {
      orderId: order.id,
      orderNumber: order.number,
      eligible: reason === null,
      reason,
      windowKind,
      policyRevision: RETURN_POLICY_REVISION,
      invoiceIssuedAt: issuedAt ? issuedAt.toISOString() : null,
      deadlineAt: deadline ? deadline.toISOString() : null,
      lines: order.items.map((item) => {
        const returned = returnedByItem.get(item.id) ?? 0;
        return {
          orderItemId: item.id, sku: item.sku, title: item.title,
          orderedQuantity: item.quantity, returnedQuantity: returned, remainingQuantity: item.quantity - returned,
          unitPrice: money(item.unitPrice), netLineAmount: money(netByItem?.get(item.id) ?? item.total),
        };
      }),
      shippingAmount: money(order.shipping),
    };
    return { order, eligibility, windowKind, deadline, returnedByItem, netByItem, pricedLines };
  }

  // ---------------------------------------------------------------------------
  // Recording a return
  // ---------------------------------------------------------------------------

  async create(orderId: string, input: ReturnCreateRequest, context: ReturnContext): Promise<ReturnResponse> {
    const reason = text(input?.reason, 500, 'reason', true)!;
    const note = text(input?.note, 500, 'note', false);
    if (!Array.isArray(input?.lines) || input.lines.length < 1 || input.lines.length > 50) throw invalid('Return 1–50 order lines.');
    const lines = input.lines.map((line) => {
      const orderItemId = text(line?.orderItemId, 128, 'orderItemId', true)!;
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 1_000_000) throw invalid('Quantity must be a positive integer.');
      if (typeof line.disposition !== 'string' || !DISPOSITIONS.has(line.disposition)) throw invalid('A valid disposition is required.');
      const warehouseId = text(line.warehouseId, 128, 'warehouseId', false);
      const locationId = text(line.locationId, 128, 'locationId', false);
      if (line.disposition === 'RESTOCK') {
        if (!warehouseId || !locationId) throw invalid('A restocked line needs a destination warehouse and location.');
      } else if (warehouseId || locationId) {
        throw invalid('Only a restocked line may name a destination; other outcomes never touch stock.');
      }
      return { orderItemId, quantity: line.quantity, disposition: line.disposition as ReturnDisposition, warehouseId, locationId };
    }).sort((a, b) => (a.orderItemId < b.orderItemId ? -1 : a.orderItemId > b.orderItemId ? 1 : 0));
    if (new Set(lines.map((line) => line.orderItemId)).size !== lines.length) throw invalid('Each order line may appear once per return.');

    const keyHash = hash(context.idempotencyKey);
    const fingerprint = hash(JSON.stringify({ actorId: context.actorId, orderId, reason, note, lines }));

    const returnId = await withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'The order changed concurrently; retry with the same idempotency key.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const [hi, lo] = advisoryLockIdKey('order', orderId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;

        const prior = await tx.orderCommandIdempotencyRecord.findUnique({ where: { orderId_scope_keyHash: { orderId, scope: CREATE_SCOPE, keyHash } } });
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'RETURN_IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
          const stored = prior.responseJson as unknown as { data?: { id?: string } } | null;
          if (stored?.data?.id) return stored.data.id;
          throw new ConflictException({ code: 'RETURN_IDEMPOTENCY_CONFLICT', message: 'The earlier request is still running.' });
        }

        const order = await tx.order.findUnique({ where: { id: orderId }, select: orderSelect });
        if (!order) throw notFound();
        const now = new Date();
        const evaluation = await this.evaluate(tx, order, now);
        if (!evaluation.eligibility.eligible) throw notEligible(evaluation.eligibility.reason!);
        const { windowKind, deadline, netByItem, pricedLines, returnedByItem } = evaluation;
        if (!windowKind || !deadline || !netByItem || !order.invoiceDocument) throw notEligible('AMOUNTS_DO_NOT_RECONCILE');

        // Amounts and quantities, line by line, from immutable order snapshots.
        const returnedAfter = new Map(returnedByItem);
        const priced = lines.map((line) => {
          const item = order.items.find((candidate) => candidate.id === line.orderItemId);
          if (!item) throw invalid('A return line does not belong to this order.');
          const alreadyReturned = returnedByItem.get(item.id) ?? 0;
          if (alreadyReturned + line.quantity > item.quantity) {
            throw new ConflictException({ code: 'RETURN_QUANTITY_EXCEEDED', message: 'Returned quantity would exceed the quantity sold.' });
          }
          returnedAfter.set(item.id, alreadyReturned + line.quantity);
          const refundAmount = incrementalLineRefund(netByItem.get(item.id)!, item.quantity, alreadyReturned, line.quantity);
          return { line, item, refundAmount };
        });
        const merchandise = priced.reduce((sum, row) => sum + row.refundAmount, 0n);
        const shipping = shippingRefund(order.shipping, pricedLines, returnedAfter);

        const sequence = order.returns.reduce((max, previous) => Math.max(max, previous.sequence), 0) + 1;
        const record = await tx.orderReturn.create({
          data: {
            orderId, sequence, windowKind, policyRevision: RETURN_POLICY_REVISION,
            invoiceId: order.invoiceDocument.id, invoiceIssuedAt: order.invoiceDocument.issuedAt,
            deadlineAt: deadline, returnedAt: now,
            merchandiseRefund: merchandise, shippingRefund: shipping, refundDue: merchandise + shipping,
            reason, note, actorId: context.actorId, requestId: context.requestId,
          },
          select: { id: true },
        });

        // Deterministic warehouse/location/SKU order avoids lock inversion with transfers.
        const ordered = [...priced].sort((a, b) => {
          const left = `${a.line.warehouseId ?? ''}:${a.line.locationId ?? ''}:${a.item.id}`;
          const right = `${b.line.warehouseId ?? ''}:${b.line.locationId ?? ''}:${b.item.id}`;
          return left < right ? -1 : left > right ? 1 : 0;
        });
        for (const [index, row] of ordered.entries()) {
          let movementId: string | null = null;
          if (row.line.disposition === 'RESTOCK') {
            const location = await tx.warehouseLocation.findFirst({
              where: { id: row.line.locationId!, warehouseId: row.line.warehouseId!, isActive: true, warehouse: { isActive: true } },
              select: { id: true },
            });
            if (!location) throw invalid('The destination warehouse and location must exist and be active.');
            const movement = await this.inventory.changeOnHandIn(tx, {
              actorId: context.actorId, requestId: context.requestId,
              warehouseId: row.line.warehouseId!, locationId: row.line.locationId!, variantId: row.item.variantId,
              delta: row.line.quantity, type: 'RETURN_IN', referenceType: 'order-return', referenceId: record.id,
              reason: 'ORDER_RETURN', idempotencyKey: hash(`order-return-stock:${record.id}:${index}`),
            });
            movementId = movement.id;
          }
          await tx.orderReturnLine.create({
            data: {
              returnId: record.id, orderItemId: row.item.id, quantity: row.line.quantity, disposition: row.line.disposition,
              unitPrice: row.item.unitPrice, refundAmount: row.refundAmount, movementId,
            },
          });
        }

        const complete = order.items.every((item) => (returnedAfter.get(item.id) ?? 0) === item.quantity);
        if (complete) {
          // An in-person order may never have been marked DELIVERED; only a delivered fulfillment can be closed.
          if (order.fulfillment?.status === 'DELIVERED') {
            await recordTransition(tx, 'fulfillment', order.fulfillment.id, 'DELIVERED', 'RETURNED', { actorId: context.actorId, requestId: context.requestId, reason: 'ORDER_RETURN' });
          }
          await recordTransition(tx, 'order', orderId, 'PAID', 'RETURNED', { actorId: context.actorId, requestId: context.requestId, reason: 'ORDER_RETURN' });
        }
        await tx.order.update({ where: { id: orderId }, data: { version: { increment: 1 } } });

        await this.audit.record({
          action: 'order.return.recorded', entityType: 'order', entityId: orderId, actorId: context.actorId, requestId: context.requestId,
          metadata: {
            returnId: record.id, sequence, windowKind, policyRevision: RETURN_POLICY_REVISION,
            deadlineAt: deadline.toISOString(), refundDue: (merchandise + shipping).toString(), lineCount: priced.length,
            dispositions: priced.map((row) => row.line.disposition), completesOrder: complete,
          },
        }, tx);

        const view = await this.view(tx, record.id);
        await storeShipmentCommandReplay(tx, { orderId, scope: CREATE_SCOPE, keyHash, fingerprint, response: { data: view } });
        return record.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
    return this.get(returnId);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async get(id: string): Promise<ReturnResponse> {
    return this.prisma.$transaction(async (tx) => {
      return { data: await this.view(tx, id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async list(query: { page: number; perPage: number; orderNumber?: string }): Promise<ReturnListResponse> {
    const where: Prisma.OrderReturnWhereInput = query.orderNumber ? { order: { number: query.orderNumber } } : {};
    return this.prisma.$transaction(async (tx) => {
      const [total, rows] = await Promise.all([
        tx.orderReturn.count({ where }),
        tx.orderReturn.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.perPage, take: query.perPage, select: { id: true } }),
      ]);
      const items = [] as OrderReturnView[];
      for (const row of rows) items.push(await this.view(tx, row.id));
      return { data: { items, meta: { page: query.page, perPage: query.perPage, total, pages: Math.max(1, Math.ceil(total / query.perPage)) } } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async view(tx: Prisma.TransactionClient, id: string): Promise<OrderReturnView> {
    const row = await tx.orderReturn.findUnique({
      where: { id },
      include: {
        order: { select: { number: true } },
        lines: { orderBy: { id: 'asc' }, include: { orderItem: { select: { sku: true, title: true } } } },
        refunds: { select: { amount: true } },
      },
    });
    if (!row) throw notFound();
    const refunded = row.refunds.reduce((sum, link) => sum + link.amount, 0n);
    return {
      id: row.id, orderId: row.orderId, orderNumber: row.order.number, number: `${row.order.number}-R${row.sequence}`, sequence: row.sequence,
      windowKind: row.windowKind, policyRevision: row.policyRevision,
      invoiceIssuedAt: row.invoiceIssuedAt.toISOString(), deadlineAt: row.deadlineAt.toISOString(), returnedAt: row.returnedAt.toISOString(),
      merchandiseRefund: money(row.merchandiseRefund), shippingRefund: money(row.shippingRefund), refundDue: money(row.refundDue),
      refunded: money(refunded), refundRemaining: money(row.refundDue - refunded),
      reason: row.reason, note: row.note,
      lines: row.lines.map((line) => ({
        orderItemId: line.orderItemId, sku: line.orderItem.sku, title: line.orderItem.title, quantity: line.quantity,
        disposition: line.disposition, unitPrice: money(line.unitPrice), refundAmount: money(line.refundAmount), movementId: line.movementId,
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Settling a return: a refund staff already executed in the gateway panel
  // ---------------------------------------------------------------------------

  async recordRefund(
    returnId: string,
    paymentId: string | null,
    input: ReturnRefundRequest,
    context: ReturnContext,
  ): Promise<ReturnRefundResponse> {
    const target = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      select: { orderId: true, order: { select: { payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, select: { id: true } } } } },
    });
    if (!target) throw notFound();
    const candidates = target.order.payments;
    const chosen = paymentId ?? (candidates.length === 1 ? candidates[0]!.id : null);
    if (!chosen || !candidates.some((payment) => payment.id === chosen)) {
      throw new ConflictException({ code: 'RETURN_NOT_ELIGIBLE', message: 'Exactly one settled payment of this order is required to record the refund.', details: { reason: 'PAYMENT_NOT_SETTLED' } });
    }
    const result = await this.refunds.record({
      paymentId: chosen, returnId, actorId: context.actorId, requestId: context.requestId, idempotencyKey: context.idempotencyKey,
      amountMinorUnits: input.amountMinorUnits, gatewayReferenceId: input.gatewayReferenceId, reason: input.reason, note: input.note,
    });
    const view = (await this.get(returnId)).data;
    return { data: { orderReturn: view, refundId: result.data.refund.refundId, paymentStatus: result.data.refund.paymentStatus } };
  }

  // ---------------------------------------------------------------------------
  // Holidays (extend only the in-person window of returns recorded afterwards)
  // ---------------------------------------------------------------------------

  async listHolidays(): Promise<{ data: { items: ReturnHolidayView[] } }> {
    const rows = await this.prisma.returnHoliday.findMany({ orderBy: { dateKey: 'asc' }, take: MAX_HOLIDAYS });
    return { data: { items: rows.map((row) => ({ id: row.id, dateKey: row.dateKey, label: row.label, createdAt: row.createdAt.toISOString() })) } };
  }

  async addHoliday(input: { dateKey: string; label: string }, actorId: string, requestId: string): Promise<{ data: ReturnHolidayView }> {
    const parsed = typeof input?.dateKey === 'string' ? parseCivilKey(input.dateKey) : null;
    const label = text(input?.label, 120, 'label', true)!;
    if (!parsed) throw invalid('dateKey must be a real calendar date in YYYY-MM-DD form.');
    const dateKey = civilKey(parsed);
    return this.prisma.$transaction(async (tx) => {
      if (await tx.returnHoliday.count() >= MAX_HOLIDAYS) throw new ConflictException({ code: 'RETURN_HOLIDAY_EXISTS', message: 'Holiday limit reached.' });
      if (await tx.returnHoliday.findUnique({ where: { dateKey }, select: { id: true } })) {
        throw new ConflictException({ code: 'RETURN_HOLIDAY_EXISTS', message: 'This date is already listed as a holiday.' });
      }
      const row = await tx.returnHoliday.create({ data: { dateKey, label, actorId } });
      await this.audit.record({ action: 'returns.holiday.added', entityType: 'return_holiday', entityId: row.id, actorId, requestId, after: { dateKey, label } }, tx);
      return { data: { id: row.id, dateKey: row.dateKey, label: row.label, createdAt: row.createdAt.toISOString() } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeHoliday(id: string, actorId: string, requestId: string): Promise<{ data: { id: string } }> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.returnHoliday.findUnique({ where: { id } });
      if (!row) throw notFound();
      await tx.returnHoliday.delete({ where: { id } });
      await this.audit.record({ action: 'returns.holiday.removed', entityType: 'return_holiday', entityId: id, actorId, requestId, before: { dateKey: row.dateKey, label: row.label } }, tx);
      return { data: { id } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
