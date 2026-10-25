import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { EnvironmentVariables } from '../../config/environment';
import { INVOICE_PDF_QUEUE_NAME, INVOICE_PDF_QUEUE_PREFIX, type InvoicePdfQueue } from './invoice-pdf-queue.port';

@Injectable()
export class BullMqInvoicePdfQueue implements InvoicePdfQueue, OnModuleDestroy {
  private readonly logger = new Logger(BullMqInvoicePdfQueue.name);
  private queue?: Queue<{ jobId: string }>;
  private connection?: Redis;
  private connectionErrorLogged = false;
  private readonly redisUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

  /** IO errors are surfaced through enqueue's rejected promise; a refused
   * connection must never crash the process as an unhandled 'error' event,
   * because the database job row stays authoritative either way. */
  private recordConnectionError(prefix: string, error: Error): void {
    if (this.connectionErrorLogged) return;
    this.connectionErrorLogged = true;
    this.logger.warn(`${prefix}: ${error.message.split('\n')[0]}`);
  }

  private getQueue(): Queue<{ jobId: string }> {
    if (this.queue) return this.queue;
    this.connection = new Redis(this.redisUrl, {
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.connection.on('error', error => this.recordConnectionError('invoice-pdf wake-up: redis unavailable', error));
    this.queue = new Queue<{ jobId: string }>(INVOICE_PDF_QUEUE_NAME, {
      connection: this.connection,
      prefix: INVOICE_PDF_QUEUE_PREFIX,
    });
    this.queue.on('error', error => this.recordConnectionError('invoice-pdf wake-up: queue unavailable', error));
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
