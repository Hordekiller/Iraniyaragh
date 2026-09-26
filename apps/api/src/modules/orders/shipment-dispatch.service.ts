import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ShipmentDispatchResponse } from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { recordTransition } from '../../common/state-machine';
import { withSerializableRetry } from '../../common/serializable-retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { ShipmentDispatchDto } from './shipment-dispatch.dto';

type Context = { actorId: string; requestId: string; idempotencyKey: string };

@Injectable()
export class ShipmentDispatchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async dispatch(orderId: string, body: ShipmentDispatchDto, context: Context): Promise<ShipmentDispatchResponse> {
    const carrier = body.carrier.trim();
    const trackingCode = body.trackingCode.trim();
    const keyHash = sha256(context.idempotencyKey);
    const fingerprint = sha256(JSON.stringify({ actorId: context.actorId, carrier, trackingCode }));
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Shipment changed concurrently; retry with the same idempotency key.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const [hi, lo] = advisoryLockIdKey('order', orderId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: {
            status: true, addressSnapshot: true, shipment: { select: { id: true } },
            fulfillment: { select: { id: true, status: true } },
            payments: { where: { status: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, select: { id: true }, take: 1 },
            items: { select: { id: true, quantity: true, fulfillmentPick: { select: { quantity: true } } } },
          },
        });
        if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
        const scope = 'shipment.dispatch:staff';
        const prior = await tx.orderCommandIdempotencyRecord.findUnique({
          where: { orderId_scope_keyHash: { orderId, scope, keyHash } },
        });
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
          if (prior.responseJson) return prior.responseJson as unknown as ShipmentDispatchResponse;
          throw conflict('Shipment dispatch is still running.');
        }
        if (order.status !== 'PAID' || order.fulfillment?.status !== 'READY_TO_SHIP' || order.payments.length === 0 || order.shipment) {
          throw conflict('Only a paid, ready-to-ship order without a shipment can be dispatched.');
        }
        if (order.items.length === 0 || order.items.some((item) => item.fulfillmentPick?.quantity !== item.quantity)) {
          throw conflict('Every order line must have exact pick proof.');
        }
        if (order.addressSnapshot === null) throw conflict('A delivery address snapshot is required.');
        const [total, consumed] = await Promise.all([
          tx.stockReservation.count({ where: { orderId } }),
          tx.stockReservation.count({ where: { orderId, status: 'CONSUMED' } }),
        ]);
        if (total === 0 || consumed !== total) throw conflict('Paid order inventory has not been consumed.');
        const shipment = await tx.shipment.create({
          data: {
            orderId, fulfillmentId: order.fulfillment.id, carrier, trackingCode,
            addressSnapshot: order.addressSnapshot as Prisma.InputJsonValue,
            actorId: context.actorId, requestId: context.requestId,
            lines: { create: order.items.map((item) => ({ orderItemId: item.id, quantity: item.quantity })) },
          },
          select: { id: true, carrier: true, trackingCode: true, dispatchedAt: true },
        });
        const transition = await recordTransition(tx, 'fulfillment', order.fulfillment.id, 'READY_TO_SHIP', 'SHIPPED', {
          actorId: context.actorId, requestId: context.requestId, reason: 'STAFF_MANUAL_DISPATCH',
        });
        const result: ShipmentDispatchResponse = { data: { shipment: {
          id: shipment.id, carrier: shipment.carrier, trackingCode: shipment.trackingCode,
          dispatchedAt: shipment.dispatchedAt.toISOString(), status: 'SHIPPED',
        } } };
        await this.audit.record({
          action: 'shipment.dispatch', entityType: 'shipment', entityId: shipment.id,
          after: { carrier, trackingCode, status: 'SHIPPED' },
          metadata: { orderId, transitionId: transition.id, lineCount: order.items.length },
          actorId: context.actorId, requestId: context.requestId,
        }, tx);
        await tx.orderCommandIdempotencyRecord.create({ data: {
          orderId, scope, keyHash, fingerprint,
          responseJson: result as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
  }
}

function conflict(message: string): ConflictException {
  return new ConflictException({ code: 'SHIPMENT_STATE_CONFLICT', message });
}
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }
