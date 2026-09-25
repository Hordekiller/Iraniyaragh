import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { ProductMediaImageProcessor } from './modules/media/image-processor.service';
import { ProductMediaCleanupService } from './modules/media/media-cleanup.service';
import { GuestCartService } from './modules/orders/guest-cart.service';
import { OutboxConsumerService } from './modules/outbox/outbox-consumer.service';
import { OutboxRelayService } from './modules/outbox/outbox-relay.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const processor = app.get(ProductMediaImageProcessor);
  const cleanup = app.get(ProductMediaCleanupService);
  const guestCarts = app.get(GuestCartService);
  const outboxConsumer = app.get(OutboxConsumerService);
  const outboxRelay = app.get(OutboxRelayService);
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
  const commerceMaintenanceQueue = new Queue('commerce-maintenance', {
    connection,
    prefix: 'iranyaragh',
  });
  await commerceMaintenanceQueue.upsertJobScheduler(
    'guest-cart-cleanup',
    { every: 15 * 60 * 1000 },
    {
      name: 'guest-cart-cleanup',
      data: {},
      opts: { removeOnComplete: { count: 100 }, removeOnFail: false },
    },
  );
  const commerceMaintenanceWorker = new Worker(
    'commerce-maintenance',
    async job => {
      if (job.name !== 'guest-cart-cleanup') {
        throw new Error('Unsupported commerce maintenance job.');
      }
      await guestCarts.sweepExpired();
    },
    { connection, prefix: 'iranyaragh', concurrency: 1 },
  );
  const outboxWorker = new Worker<{ eventId: string }>(
    'commerce-outbox',
    async job => {
      if (job.name !== 'deliver' || typeof job.data.eventId !== 'string') {
        throw new Error('Unsupported commerce outbox job.');
      }
      try {
        await outboxConsumer.consume(job.data.eventId);
      } catch (error) {
        await outboxConsumer.recordFailure(
          job.data.eventId,
          error,
          job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
        );
        throw error;
      }
    },
    { connection, prefix: 'iranyaragh', concurrency: 4 },
  );
  worker.on('error', () => process.stderr.write('Product media worker infrastructure error.\n'));
  maintenanceWorker.on('error', () => process.stderr.write('Product media maintenance worker error.\n'));
  commerceMaintenanceWorker.on('error', () =>
    process.stderr.write('Commerce maintenance worker error.\n'),
  );
  outboxWorker.on('error', () => process.stderr.write('Commerce outbox worker error.\n'));
  outboxWorker.on('failed', job => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      process.stderr.write('Commerce outbox processing dead-lettered; inspect database evidence.\n');
    }
  });

  let outboxPass: Promise<void> | null = null;
  const runOutbox = () => {
    if (outboxPass) return;
    outboxPass = outboxRelay.dispatchBatch()
      .then(result => {
        if (result.claimed > 0) {
          process.stdout.write(
            `Outbox relay claimed=${result.claimed} published=${result.published} dead_lettered=${result.deadLettered}\n`,
          );
        }
      })
      .catch(() => { process.stderr.write('Outbox relay pass failed.\n'); })
      .finally(() => { outboxPass = null; });
  };
  const outboxTimer = setInterval(runOutbox, 5_000);
  runOutbox();

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(outboxTimer);
    await outboxPass;
    await outboxWorker.close();
    await worker.close();
    await maintenanceWorker.close();
    await commerceMaintenanceWorker.close();
    await maintenanceQueue.close();
    await commerceMaintenanceQueue.close();
    await app.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

void bootstrap();
