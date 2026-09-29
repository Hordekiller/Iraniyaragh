import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ShipmentDeliveryResponse } from '@iranyaragh/contracts';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { recordTransition } from '../../common/state-machine';
import { withSerializableRetry } from '../../common/serializable-retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { ShipmentDeliveryDto } from './shipment-delivery.dto';
import { shipmentConflict, shipmentHash, storeShipmentCommandReplay, STAFF_DELIVERY_PROOF_PREFIX } from './shipment-command-utils';

type Context = { actorId: string; requestId: string; idempotencyKey: string };

@Injectable()
export class ShipmentDeliveryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async confirm(orderId: string, body: ShipmentDeliveryDto, context: Context): Promise<ShipmentDeliveryResponse> {
    const proofReference = body.proofReference;
    const keyHash = shipmentHash(context.idempotencyKey);
    const fingerprint = shipmentHash(JSON.stringify({ actorId: context.actorId, proofReference }));
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Delivery changed concurrently; retry with the same idempotency key.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const [hi, lo] = advisoryLockIdKey('order', orderId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { shipment: { select: { id: true } }, fulfillment: { select: { id: true, status: true } } },
        });
        if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found.' });
        const scope = 'shipment.delivery:staff';
        const prior = await tx.orderCommandIdempotencyRecord.findUnique({
          where: { orderId_scope_keyHash: { orderId, scope, keyHash } },
        });
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency key payload conflict.' });
          if (prior.responseJson) return prior.responseJson as unknown as ShipmentDeliveryResponse;
          throw shipmentConflict('Delivery confirmation is still running.');
        }
        if (!order.shipment || order.fulfillment?.status !== 'SHIPPED') {
          throw shipmentConflict('Only a dispatched shipment can be confirmed delivered.');
        }
        const transition = await recordTransition(tx, 'fulfillment', order.fulfillment.id, 'SHIPPED', 'DELIVERED', {
          actorId: context.actorId, requestId: context.requestId,
          reason: `${STAFF_DELIVERY_PROOF_PREFIX}${proofReference}`,
        });
        const event = await tx.fulfillmentTransition.findUniqueOrThrow({ where: { id: transition.id }, select: { createdAt: true } });
        const result: ShipmentDeliveryResponse = { data: { delivery: {
          shipmentId: order.shipment.id, orderId, status: 'DELIVERED', proofReference,
          confirmedAt: event.createdAt.toISOString(),
        } } };
        await this.audit.record({
          action: 'shipment.delivery.confirm', entityType: 'shipment', entityId: order.shipment.id,
          before: { status: 'SHIPPED' }, after: { status: 'DELIVERED', proofReference },
          metadata: { orderId, transitionId: transition.id }, actorId: context.actorId, requestId: context.requestId,
        }, tx);
        await tx.outboxEvent.create({
          data: {
            topic: 'SHIPMENT_DELIVERED', aggregateType: 'order', aggregateId: orderId,
            payload: { shipmentId: order.shipment.id, transitionId: transition.id },
            deduplicationKey: `shipment:${order.shipment.id}:delivered`,
          },
        });
        await storeShipmentCommandReplay(tx, { orderId, scope, keyHash, fingerprint, response: result });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
  }
}
