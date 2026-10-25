import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { EnvironmentVariables } from '../../config/environment';
import { REPORT_EXPORT_QUEUE_NAME, REPORT_EXPORT_QUEUE_PREFIX, type ReportExportQueue } from './report-export-queue.port';

@Injectable()
export class BullMqReportExportQueue implements ReportExportQueue, OnModuleDestroy {
  private readonly logger = new Logger(BullMqReportExportQueue.name);
  private queue?: Queue<{ jobId: string }>;
  private connection?: Redis;
  private connectionErrorLogged = false;
  private readonly redisUrl: string;

  constructor(@Inject(ConfigService) config: ConfigService<EnvironmentVariables, true>) {
    this.redisUrl = config.get('REDIS_URL', { infer: true });
  }

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
    this.connection.on('error', error => this.recordConnectionError('report-export wake-up: redis unavailable', error));
    this.queue = new Queue<{ jobId: string }>(REPORT_EXPORT_QUEUE_NAME, {
      connection: this.connection,
      prefix: REPORT_EXPORT_QUEUE_PREFIX,
    });
    this.queue.on('error', error => this.recordConnectionError('report-export wake-up: queue unavailable', error));
    return this.queue;
  }

  async enqueue(jobId: string): Promise<void> {
    // Database eligibility is reread on delivery; the bounded attempt family
    // matches the render job without duplicating queue churn.
    await this.getQueue().add('export', { jobId }, {
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
