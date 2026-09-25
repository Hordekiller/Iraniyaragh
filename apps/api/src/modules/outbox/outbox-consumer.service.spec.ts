import { OutboxEffectKind, OutboxEffectStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { OutboxConsumerService } from './outbox-consumer.service';

function setup(topic = 'ORDER_CREATED', aggregateType = 'order') {
  const event = {
    id: 'event-1', topic, aggregateType, aggregateId: 'aggregate-1', consumedAt: null as Date | null,
  };
  const tx = {
    outboxEvent: {
      findUnique: vi.fn(async () => event),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    order: { findUnique: vi.fn(async () => ({ id: 'aggregate-1' })) },
    payment: { findUnique: vi.fn(async () => ({ id: 'aggregate-1', orderId: 'order-1', status: 'PENDING' })) },
    outboxEffect: {
      createMany: vi.fn(async () => ({ count: 1 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
    outboxEvent: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const consumer = new OutboxConsumerService(prisma as unknown as PrismaService);
  return { event, tx, prisma, consumer };
}

describe('OutboxConsumerService', () => {
  it.each([
    ['ORDER_CREATED', 'order', OutboxEffectKind.CUSTOMER_ORDER_CREATED, 'aggregate-1'],
    ['ORDER_CANCELLED', 'order', OutboxEffectKind.CUSTOMER_ORDER_CANCELLED, 'aggregate-1'],
    ['ORDER_EXPIRED', 'order', OutboxEffectKind.CUSTOMER_ORDER_EXPIRED, 'aggregate-1'],
    ['PAYMENT_VERIFIED', 'payment', OutboxEffectKind.CUSTOMER_ORDER_PAID, 'order-1'],
    ['PAYMENT_VERIFICATION_UNCONFIRMED', 'payment', OutboxEffectKind.PAYMENT_RECONCILIATION, 'aggregate-1'],
    ['PAYMENT_VERIFIED_AFTER_CANCELLED', 'payment', OutboxEffectKind.PAYMENT_REFUND_REVIEW, 'aggregate-1'],
  ])('projects %s into exactly one pending effect', async (topic, aggregateType, kind, subjectId) => {
    const { tx, consumer } = setup(topic, aggregateType);
    await consumer.consume('event-1');
    expect(tx.outboxEffect.createMany).toHaveBeenCalledWith({
      data: [{ eventId: 'event-1', kind, subjectId, status: OutboxEffectStatus.PENDING }], skipDuplicates: true,
    });
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', consumedAt: null },
      data: {
        consumedAt: expect.any(Date), processingDeadLetteredAt: null, lastProcessingErrorCode: null,
      },
    });
  });

  it('replays a consumed event without a second effect', async () => {
    const { event, tx, consumer } = setup();
    event.consumedAt = new Date();
    await consumer.consume('event-1');
    expect(tx.outboxEffect.createMany).not.toHaveBeenCalled();
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('does not leave a resolved ambiguous payment as an open operations effect', async () => {
    const { tx, consumer } = setup('PAYMENT_VERIFICATION_UNCONFIRMED', 'payment');
    tx.payment.findUnique.mockResolvedValueOnce({ id: 'aggregate-1', orderId: 'order-1', status: 'PAID' });
    await consumer.consume('event-1');
    expect(tx.outboxEffect.createMany).toHaveBeenCalledWith({
      data: [{
        eventId: 'event-1', kind: OutboxEffectKind.PAYMENT_RECONCILIATION,
        subjectId: 'aggregate-1', status: OutboxEffectStatus.COMPLETED,
      }],
      skipDuplicates: true,
    });
  });

  it('closes a previously pending reconciliation effect when paid evidence is consumed', async () => {
    const { tx, consumer } = setup('PAYMENT_VERIFIED', 'payment');
    await consumer.consume('event-1');
    expect(tx.outboxEffect.updateMany).toHaveBeenCalledWith({
      where: {
        kind: OutboxEffectKind.PAYMENT_RECONCILIATION,
        subjectId: 'aggregate-1',
        status: OutboxEffectStatus.PENDING,
      },
      data: { status: OutboxEffectStatus.COMPLETED },
    });
  });

  it('does not acknowledge unknown or mismatched topics', async () => {
    const unknown = setup('FUTURE_TOPIC');
    await expect(unknown.consumer.consume('event-1')).rejects.toThrow('Unsupported outbox');
    expect(unknown.tx.outboxEffect.createMany).not.toHaveBeenCalled();
    expect(unknown.tx.outboxEvent.updateMany).not.toHaveBeenCalled();

    const mismatched = setup('PAYMENT_VERIFIED', 'order');
    await expect(mismatched.consumer.consume('event-1')).rejects.toThrow('Unsupported outbox');
    expect(mismatched.tx.outboxEffect.createMany).not.toHaveBeenCalled();
  });

  it('does not acknowledge an absent business subject', async () => {
    const { tx, consumer } = setup();
    tx.order.findUnique.mockResolvedValueOnce(null as never);
    await expect(consumer.consume('event-1')).rejects.toThrow('Order subject not found');
    expect(tx.outboxEffect.createMany).not.toHaveBeenCalled();
  });

  it('records only a safe error class and terminal processing state', async () => {
    const { prisma, consumer } = setup();
    await consumer.recordFailure('event-1', new Error('private gateway authority'), true);
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', consumedAt: null },
      data: {
        lastProcessingErrorCode: 'Error',
        processingDeadLetteredAt: expect.any(Date),
      },
    });
  });
});
