import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvironmentVariables } from '../../config/environment';
import { INVOICE_PDF_QUEUE_NAME, INVOICE_PDF_QUEUE_PREFIX, type InvoicePdfQueue } from './invoice-pdf-queue.port';

@Injectable()
export class BullMqInvoicePdfQueue implements InvoicePdfQueue, OnModuleDestroy {
  private queue?: Queue<{ jobId: string }>;
  private readonly redisUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  private getQueue(): Queue<{ jobId: string }> {
    this.queue ??= new Queue<{ jobId: string }>(INVOICE_PDF_QUEUE_NAME, {
      connection: {
        url: this.redisUrl,
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix: INVOICE_PDF_QUEUE_PREFIX,
    });
    return this.queue;
  }

  async enqueue(jobId: string): Promise<void> {
    // Database eligibility is reread on every delivery, so a retained or aged
    // job replay is safe; bounded attempts without unbounded queue duplication.
    await this.getQueue().add('render', { jobId }, {
      jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue?.close();
  }
}
