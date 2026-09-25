import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { OutboxRelayService } from './outbox-relay.service';
import type { OutboxQueue } from './outbox-queue.port';

describe.sequential('OutboxRelayService database integration', () => {
  const id = `outbox-${randomUUID()}`;
  const prisma = new PrismaService();
  const enqueue = vi.fn(async () => undefined);
  const queue: OutboxQueue = { enqueue };
  const first = new OutboxRelayService(prisma, queue);
  const second = new OutboxRelayService(prisma, queue);

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: id } });
    await prisma.$disconnect();
  });

  it('claims an event exactly once across concurrent relay instances', async () => {
    await prisma.outboxEvent.create({
      data: {
        topic: 'OUTBOX_TEST',
        aggregateType: 'test',
        aggregateId: id,
        payload: {},
        deduplicationKey: id,
      },
    });
    await Promise.all([first.dispatchBatch(), second.dispatchBatch()]);
    const event = await prisma.outboxEvent.findUniqueOrThrow({ where: { deduplicationKey: id } });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(event.id);
    expect(event.attempts).toBe(1);
    expect(event.publishedAt).not.toBeNull();
    expect(event.deadLetteredAt).toBeNull();
  });
});
