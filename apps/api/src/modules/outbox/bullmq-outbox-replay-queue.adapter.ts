import { Queue } from 'bullmq';
import { OUTBOX_QUEUE_NAME, OUTBOX_QUEUE_PREFIX } from './outbox-queue.port';
import type { OutboxReplayQueue } from './outbox-replay-queue.port';

export class BullMqOutboxReplayQueue implements OutboxReplayQueue {
  private readonly queue: Queue<{ eventId: string }>;

  constructor(redisUrl: string) {
    this.queue = new Queue<{ eventId: string }>(OUTBOX_QUEUE_NAME, {
      connection: {
        url: redisUrl,
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix: OUTBOX_QUEUE_PREFIX,
    });
  }

  async clearTerminalJob(eventId: string): Promise<boolean> {
    const job = await this.queue.getJob(eventId);
    if (!job) return true;
    const state = await job.getState();
    if (state !== 'failed' && state !== 'completed') return false;
    await job.remove();
    return true;
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
