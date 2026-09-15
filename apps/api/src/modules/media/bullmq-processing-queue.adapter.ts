import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../../config/environment';
import type { ProductMediaProcessingQueue } from './processing-queue.port';

type MediaProcessingJob = { mediaId: string; objectKey: string };

@Injectable()
export class BullMqProductMediaProcessingQueue implements ProductMediaProcessingQueue, OnModuleDestroy {
  private queue?: Queue<MediaProcessingJob>;
  private readonly redisUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  private getQueue(): Queue<MediaProcessingJob> {
    this.queue ??= new Queue<MediaProcessingJob>('product-media-processing', {
      connection: { url: this.redisUrl },
      prefix: 'iranyaragh',
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: false,
      },
    });
    return this.queue;
  }

  async enqueue(input: MediaProcessingJob): Promise<void> {
    await this.getQueue().add('process', input, { jobId: input.mediaId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
