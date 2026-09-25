import { Inject, Injectable } from '@nestjs/common';
import { OutboxEffectKind, OutboxEffectStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

const TOPIC_KIND: Readonly<Record<string, OutboxEffectKind>> = {
  ORDER_CREATED: OutboxEffectKind.CUSTOMER_ORDER_CREATED,
  ORDER_CANCELLED: OutboxEffectKind.CUSTOMER_ORDER_CANCELLED,
  ORDER_EXPIRED: OutboxEffectKind.CUSTOMER_ORDER_EXPIRED,
  PAYMENT_VERIFIED: OutboxEffectKind.CUSTOMER_ORDER_PAID,
  PAYMENT_VERIFICATION_UNCONFIRMED: OutboxEffectKind.PAYMENT_RECONCILIATION,
  PAYMENT_VERIFIED_AFTER_CANCELLED: OutboxEffectKind.PAYMENT_REFUND_REVIEW,
  PAYMENT_VERIFICATION_FAILED: OutboxEffectKind.PAYMENT_RECONCILIATION,
};

/**
 * Topics that report a settled payment. Every one of them must close the open
 * reconciliation effect of that payment, otherwise a resolved ambiguous payment
 * keeps a permanently pending operations effect.
 */
const SETTLED_PAYMENT_TOPICS: ReadonlySet<string> = new Set([
  'PAYMENT_VERIFIED',
  'PAYMENT_VERIFIED_AFTER_CANCELLED',
  'PAYMENT_VERIFICATION_FAILED',
]);

class UnsupportedOutboxTopicError extends Error {}
class OutboxSubjectNotFoundError extends Error {}

@Injectable()
export class OutboxConsumerService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Atomically records an actionable intent and acknowledges one queued event. */
  async consume(eventId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const event = await tx.outboxEvent.findUnique({
        where: { id: eventId },
        select: { id: true, topic: true, aggregateType: true, aggregateId: true, consumedAt: true },
      });
      if (!event) throw new OutboxSubjectNotFoundError('Outbox event not found.');
      if (event.consumedAt) return;

      const kind = TOPIC_KIND[event.topic];
      const expectedAggregate = event.topic.startsWith('ORDER_') ? 'order' : 'payment';
      if (!kind || event.aggregateType !== expectedAggregate) {
        throw new UnsupportedOutboxTopicError('Unsupported outbox event topic or aggregate.');
      }

      let subjectId = event.aggregateId;
      let status: OutboxEffectStatus = OutboxEffectStatus.PENDING;
      let paymentId: string | null = null;
      if (expectedAggregate === 'order') {
        const order = await tx.order.findUnique({ where: { id: event.aggregateId }, select: { id: true } });
        if (!order) throw new OutboxSubjectNotFoundError('Order subject not found.');
      } else {
        const payment = await tx.payment.findUnique({
          where: { id: event.aggregateId },
          select: { id: true, orderId: true, status: true },
        });
        if (!payment) throw new OutboxSubjectNotFoundError('Payment subject not found.');
        paymentId = payment.id;
        if (kind === OutboxEffectKind.CUSTOMER_ORDER_PAID) subjectId = payment.orderId;
        if (kind === OutboxEffectKind.PAYMENT_RECONCILIATION && payment.status !== 'PENDING') {
          status = OutboxEffectStatus.COMPLETED;
        }
        if (SETTLED_PAYMENT_TOPICS.has(event.topic)) {
          await this.closeReconciliation(tx, payment.id);
        }
      }

      await tx.outboxEffect.createMany({
        data: [{ eventId: event.id, kind, subjectId, status }],
        skipDuplicates: true,
      });

      // ReadCommitted does not hold one snapshot across the transaction, so an
      // ambiguous payment resolved by a concurrent settlement transaction would
      // otherwise leave this effect open forever.
      if (paymentId && kind === OutboxEffectKind.PAYMENT_RECONCILIATION && status === OutboxEffectStatus.PENDING) {
        const settled = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
        if (settled && settled.status !== 'PENDING') {
          await tx.outboxEffect.updateMany({
            where: { eventId: event.id, status: OutboxEffectStatus.PENDING },
            data: { status: OutboxEffectStatus.COMPLETED },
          });
        }
      }

      await tx.outboxEvent.updateMany({
        where: { id: event.id, consumedAt: null },
        data: { consumedAt: new Date(), processingDeadLetteredAt: null, lastProcessingErrorCode: null },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  private async closeReconciliation(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    await tx.outboxEffect.updateMany({
      where: {
        kind: OutboxEffectKind.PAYMENT_RECONCILIATION,
        subjectId: paymentId,
        status: OutboxEffectStatus.PENDING,
      },
      data: { status: OutboxEffectStatus.COMPLETED },
    });
  }

  async recordFailure(eventId: string, error: unknown, finalAttempt: boolean): Promise<void> {
    const name = error instanceof Error ? error.name : 'UnknownError';
    const code = /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'UnknownError';
    await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, consumedAt: null },
      data: {
        lastProcessingErrorCode: code,
        processingDeadLetteredAt: finalAttempt ? new Date() : null,
      },
    });
  }
}
