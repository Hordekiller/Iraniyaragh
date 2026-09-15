import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { ProductMediaImageProcessor } from './modules/media/image-processor.service';
import { ProductMediaCleanupService } from './modules/media/media-cleanup.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const processor = app.get(ProductMediaImageProcessor);
  const cleanup = app.get(ProductMediaCleanupService);
  const connection = { url: config.get('REDIS_URL', { infer: true }) };
  const worker = new Worker<{ mediaId: string }>(
    'product-media-processing',
    async job => processor.process(job.data.mediaId, {
      finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
    }),
    {
      connection,
      prefix: 'iranyaragh',
      concurrency: config.get('PRODUCT_MEDIA_WORKER_CONCURRENCY', { infer: true }),
    },
  );
  const maintenanceQueue = new Queue('product-media-maintenance', { connection, prefix: 'iranyaragh' });
  await maintenanceQueue.upsertJobScheduler(
    'periodic-cleanup',
    { every: 15 * 60 * 1000 },
    { name: 'cleanup', data: {}, opts: { removeOnComplete: { count: 100 }, removeOnFail: false } },
  );
  const maintenanceWorker = new Worker(
    'product-media-maintenance',
    async job => {
      if (job.name !== 'cleanup') throw new Error('Unsupported product media maintenance job.');
      await cleanup.sweep();
    },
    { connection, prefix: 'iranyaragh', concurrency: 1 },
  );
  worker.on('error', () => process.stderr.write('Product media worker infrastructure error.\n'));
  maintenanceWorker.on('error', () => process.stderr.write('Product media maintenance worker error.\n'));

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await worker.close();
    await maintenanceWorker.close();
    await maintenanceQueue.close();
    await app.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

void bootstrap();
