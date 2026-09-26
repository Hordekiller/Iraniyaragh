import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FulfillmentPickListResponse, FulfillmentPickProof, FulfillmentPickResponse } from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { withSerializableRetry } from '../../common/serializable-retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

type Context = { actorId: string; requestId: string; idempotencyKey: string };

@Injectable()
export class FulfillmentPickService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async list(orderId: string): Promise<FulfillmentPickListResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        fulfillment: { select: { id: true, status: true } },
        items: {
          select: {
            id: true, sku: true, productTitle: true, variantTitle: true, quantity: true,
            fulfillmentPick: { select: { id: true, orderItemId: true, quantity: true, actorId: true, requestId: true, createdAt: true } },
          },
          orderBy: [{ ordinal: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!order || !order.fulfillment) throw missingFulfillment();
    return {
      data: {
        fulfillment: order.fulfillment,
        items: order.items.map((item) => ({
          orderItemId: item.id,
          sku: item.sku,
          productTitle: item.productTitle,
          variantTitle: item.variantTitle,
          quantity: item.quantity,
          pick: item.fulfillmentPick ? proof(item.fulfillmentPick) : null,
        })),
      },
    };
  }

  async record(orderId: string, itemId: string, quantity: number, context: Context): Promise<FulfillmentPickResponse> {
    const keyHash = sha256(context.idempotencyKey);
    const fingerprint = sha256(JSON.stringify({ actorId: context.actorId, itemId, quantity }));
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Pick proof changed concurrently; retry with the same idempotency key.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const [hi, lo] = advisoryLockIdKey('order', orderId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            status: true,
            fulfillment: { select: { id: true, status: true } },
            payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, select: { id: true }, take: 1 },
            items: { where: { id: itemId }, select: { id: true, quantity: true }, take: 1 },
          },
        });
        if (!order) throw missingFulfillment();
        const scope = 'fulfillment.pick:staff';
        const prior = await tx.orderCommandIdempotencyRecord.findUnique({
          where: { orderId_scope_keyHash: { orderId, scope, keyHash } },
        });
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
          if (prior.responseJson) return prior.responseJson as unknown as FulfillmentPickResponse;
          throw new ConflictException({ code: 'CONFLICT', message: 'Pick command is still running.' });
        }
        const item = order.items[0];
        if (!item) throw new NotFoundException({ code: 'ORDER_ITEM_NOT_FOUND', message: 'Order item not found.' });
        if (order.status !== 'PAID' || order.fulfillment?.status !== 'PROCESSING' || order.payments.length === 0) {
          throw pickConflict('Paid order must be processing before pick proof.');
        }
        if (quantity !== item.quantity) throw pickConflict('Pick quantity must equal the ordered line quantity.');
        const [total, consumed] = await Promise.all([
          tx.stockReservation.count({ where: { orderId } }),
          tx.stockReservation.count({ where: { orderId, status: 'CONSUMED' } }),
        ]);
        if (total === 0 || consumed !== total) throw pickConflict('Paid order inventory has not been consumed.');
        if (await tx.fulfillmentPick.findUnique({ where: { orderItemId: itemId }, select: { id: true } })) {
          throw pickConflict('This order item has already been picked.');
        }
        const created = await tx.fulfillmentPick.create({
          data: { fulfillmentId: order.fulfillment.id, orderItemId: itemId, quantity, actorId: context.actorId, requestId: context.requestId },
          select: { id: true, orderItemId: true, quantity: true, actorId: true, requestId: true, createdAt: true },
        });
        const result: FulfillmentPickResponse = { data: { pick: proof(created) } };
        await this.audit.record({
          action: 'fulfillment.item.picked', entityType: 'fulfillment', entityId: order.fulfillment.id,
          after: { orderItemId: itemId, quantity }, metadata: { orderId, pickId: created.id },
          actorId: context.actorId, requestId: context.requestId,
        }, tx);
        await tx.orderCommandIdempotencyRecord.create({
          data: { orderId, scope, keyHash, fingerprint, responseJson: result as unknown as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
        });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
  }
}

function proof(row: { id: string; orderItemId: string; quantity: number; actorId: string | null; requestId: string; createdAt: Date }): FulfillmentPickProof {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

function missingFulfillment(): NotFoundException {
  return new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order fulfillment not found.' });
}

function pickConflict(message: string): ConflictException {
  return new ConflictException({ code: 'FULFILLMENT_STATE_CONFLICT', message });
}
