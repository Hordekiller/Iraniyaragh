import { RedactedLogger } from './common/redacted-logger';
import { diagnosticException } from '@iranyaragh/contracts';
import { observeWorker } from './common/worker-diagnostics';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { ProductMediaImageProcessor } from './modules/media/image-processor.service';
import { ProductMediaCleanupService } from './modules/media/media-cleanup.service';
import { GuestCartService } from './modules/orders/guest-cart.service';
import { OrderCommandService } from './modules/orders/order-command.service';
import { startOrderExpiryRuntime } from './modules/orders/order-expiry-runtime';
import { PrismaService } from './database/prisma.service';
import { OutboxConsumerService } from './modules/outbox/outbox-consumer.service';
import { OutboxRelayService } from './modules/outbox/outbox-relay.service';
import { CustomerSmsDeliveryService } from './modules/notifications/customer-sms-delivery.service';
import { OUTBOX_QUEUE_NAME, OUTBOX_QUEUE_PREFIX } from './modules/outbox/outbox-queue.port';

process.env.SERVICE_NAME ??= 'iranyaragh-media-worker';
const diagnostics = new RedactedLogger();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get(ConfigService<EnvironmentVariables, true>);
  const processor = app.get(ProductMediaImageProcessor);
  const cleanup = app.get(ProductMediaCleanupService);
  const guestCarts = app.get(GuestCartService);
  const outboxConsumer = app.get(OutboxConsumerService);
  const outboxRelay = app.get(OutboxRelayService);
  const customerSms = app.get(CustomerSmsDeliveryService);
  const connection = { url: config.get('REDIS_URL', { infer: true }) };
  const orderExpiry = await startOrderExpiryRuntime({
    redisUrl: connection.url,
    enabled: config.get('ORDER_EXPIRY_ENABLED', { infer: true }),
    prisma: app.get(PrismaService),
    commands: app.get(OrderCommandService),
  });
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
    OUTBOX_QUEUE_NAME,
    async job => {
      try {
        if (job.name !== 'deliver' || typeof job.data.eventId !== 'string') {
          throw new Error('Unsupported commerce outbox job.');
        }
        await outboxConsumer.consume(job.data.eventId);
      } catch (error) {
        if (typeof job.data.eventId === 'string') {
          await outboxConsumer.recordFailure(
            job.data.eventId,
            error,
            job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
          );
        }
        // BullMQ retains the failure reason, so never forward raw error text.
        throw new Error('Commerce outbox job failed; inspect lastProcessingErrorCode.');
      }
    },
    { connection, prefix: OUTBOX_QUEUE_PREFIX, concurrency: 4 },
  );
  observeWorker(worker, 'product-media-processing');
  observeWorker(maintenanceWorker, 'product-media-maintenance');
  observeWorker(commerceMaintenanceWorker, 'commerce-maintenance');
  observeWorker(outboxWorker, OUTBOX_QUEUE_NAME);
  maintenanceQueue.on('error', error => diagnostics.event('error', { event: 'worker.queue.failed', outcome: 'failure', data: { queue: 'product-media-maintenance', ...diagnosticException(error) } }));
  commerceMaintenanceQueue.on('error', error => diagnostics.event('error', { event: 'worker.queue.failed', outcome: 'failure', data: { queue: 'commerce-maintenance', ...diagnosticException(error) } }));

  let outboxPass: Promise<void> | null = null;
  const runOutbox = () => {
    if (outboxPass) return;
    outboxPass = outboxRelay.dispatchBatch()
      .then(result => {
        if (result.claimed > 0) {
          diagnostics.event('info', { event: 'outbox.relay.completed', data: { ...result } });
        }
      })
      .catch(() => { diagnostics.event('error', { event: 'outbox.relay.failed', outcome: 'unknown' }); })
      .finally(() => { outboxPass = null; });
  };
  const outboxTimer = setInterval(runOutbox, 5_000);
  runOutbox();

  let smsPass: Promise<void> | null = null;
  const runSms = () => {
    if (smsPass) return;
    smsPass = customerSms.dispatchBatch()
      .then(result => {
        if (result.claimed > 0) {
          diagnostics.event('info', { event: 'sms.delivery.completed', data: { ...result } });
        }
      })
      .catch(() => { diagnostics.event('error', { event: 'sms.delivery.failed', outcome: 'unknown' }); })
      .finally(() => { smsPass = null; });
  };
  const smsTimer = setInterval(runSms, 5_000);
  runSms();

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(outboxTimer);
    clearInterval(smsTimer);
    await orderExpiry.close();
    await outboxPass;
    await smsPass;
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

void bootstrap().catch(error => { diagnostics.event('error', { event: 'worker.startup.failed', outcome: 'failure', data: diagnosticException(error) }); process.exit(1); });
