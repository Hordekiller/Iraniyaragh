import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { OutboxRelayService } from './outbox-relay.service';
import type { OutboxQueue } from './outbox-queue.port';

function setup(events: Array<{ id: string; attempts: number }>) {
  const prisma = {
    $queryRaw: vi.fn(async () => events),
    outboxEvent: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const queue = { enqueue: vi.fn(async () => undefined) };
  const relay = new OutboxRelayService(
    prisma as unknown as PrismaService,
    queue as OutboxQueue,
  );
  return { prisma, queue, relay };
}

describe('OutboxRelayService', () => {
  it('does not publish an empty batch', async () => {
    const { prisma, queue, relay } = setup([]);
    await expect(relay.dispatchBatch()).resolves.toEqual({ claimed: 0, published: 0, deadLettered: 0 });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('marks only a successfully enqueued, still-owned event as published', async () => {
    const { prisma, queue, relay } = setup([{ id: 'event-1', attempts: 1 }]);
    await expect(relay.dispatchBatch()).resolves.toEqual({ claimed: 1, published: 1, deadLettered: 0 });
    expect(queue.enqueue).toHaveBeenCalledWith('event-1');
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', attempts: 1, publishedAt: null, deadLetteredAt: null },
      data: { publishedAt: expect.any(Date), lastErrorCode: null },
    });
  });

  it('retries a failed queue write without exposing the error message', async () => {
    const { prisma, queue, relay } = setup([{ id: 'event-2', attempts: 2 }]);
    queue.enqueue.mockRejectedValueOnce(new Error('redis://secret@example.com'));
    await expect(relay.dispatchBatch()).resolves.toEqual({ claimed: 1, published: 0, deadLettered: 0 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-2', attempts: 2, publishedAt: null, deadLetteredAt: null },
      data: { availableAt: expect.any(Date), deadLetteredAt: null, lastErrorCode: 'Error' },
    });
  });

  it('dead-letters a failed eighth attempt instead of marking it published', async () => {
    const { prisma, queue, relay } = setup([{ id: 'event-3', attempts: 8 }]);
    queue.enqueue.mockRejectedValueOnce(new Error('offline'));
    await expect(relay.dispatchBatch()).resolves.toEqual({ claimed: 1, published: 0, deadLettered: 1 });
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: 'event-3', attempts: 8, publishedAt: null, deadLetteredAt: null },
      data: { availableAt: expect.any(Date), deadLetteredAt: expect.any(Date), lastErrorCode: 'Error' },
    });
  });
});
