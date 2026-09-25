import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxEffectKind } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { OutboxConsumerService } from './outbox-consumer.service';

describe.sequential('OutboxConsumerService database integration', () => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const customerId = `outbox-customer-${suffix}`;
  const orderId = `outbox-order-${suffix}`;
  const eventId = `outbox-event-${suffix}`;
  const mobile = `+989${(BigInt(`0x${suffix}`) % 1_000_000_000n).toString().padStart(9, '0')}`;
  const prisma = new PrismaService();
  const first = new OutboxConsumerService(prisma);
  const second = new OutboxConsumerService(prisma);

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    await prisma.customer.create({ data: { id: customerId, mobile } });
    await prisma.order.create({
      data: {
        id: orderId,
        number: `OUTBOX-${suffix}`,
        customerId,
        status: 'PENDING_PAYMENT',
        subtotal: 100n,
        discount: 0n,
        shipping: 0n,
        grandTotal: 100n,
        addressSnapshot: { test: true },
        shippingMethod: 'STANDARD',
        shippingMethodTitle: 'Standard shipping',
        shippingPolicyRevision: 'test',
        pricePolicyRevision: 'test',
        reservationExpiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.outboxEvent.create({
      data: {
        id: eventId,
        topic: 'ORDER_CREATED',
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {},
        deduplicationKey: `outbox-created:${orderId}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.outboxEffect.deleteMany({ where: { eventId } });
    await prisma.outboxEvent.deleteMany({ where: { id: eventId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it('projects one effect under concurrent replay and acknowledges only after persistence', async () => {
    await Promise.all([first.consume(eventId), second.consume(eventId)]);
    await first.consume(eventId);
    await expect(prisma.outboxEffect.findMany({ where: { eventId } })).resolves.toMatchObject([
      { kind: OutboxEffectKind.CUSTOMER_ORDER_CREATED, subjectId: orderId, status: 'PENDING' },
    ]);
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.consumedAt).not.toBeNull();
    expect(event.processingDeadLetteredAt).toBeNull();
  });
});
