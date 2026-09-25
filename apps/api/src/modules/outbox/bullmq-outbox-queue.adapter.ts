import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../../config/environment';
import type { OutboxQueue } from './outbox-queue.port';

@Injectable()
export class BullMqOutboxQueue implements OutboxQueue, OnModuleDestroy {
  private queue?: Queue<{ eventId: string }>;
  private readonly redisUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  private getQueue(): Queue<{ eventId: string }> {
    this.queue ??= new Queue<{ eventId: string }>('commerce-outbox', {
      connection: {
        url: this.redisUrl,
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix: 'iranyaragh',
    });
    return this.queue;
  }

  async enqueue(eventId: string): Promise<void> {
    await this.getQueue().add('deliver', { eventId }, {
      jobId: eventId,
      // Keep completed job IDs so an acknowledgement race cannot enqueue twice.
      removeOnComplete: false,
      removeOnFail: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
