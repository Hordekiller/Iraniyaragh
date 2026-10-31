import { RedactedLogger } from './common/redacted-logger';
import { diagnosticException } from '@iranyaragh/contracts';
import { observeWorker } from './common/worker-diagnostics';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { InvoicePdfJobService } from './modules/invoices/invoice-pdf-job.service';
import { InvoicePdfRenderProcessor } from './modules/invoices/invoice-pdf-render.processor';
import { INVOICE_PDF_QUEUE_NAME, INVOICE_PDF_QUEUE_PREFIX } from './modules/invoices/invoice-pdf-queue.port';
import { ReportExportJobService } from './modules/reports/report-export-job.service';
import { ReportExportRenderer } from './modules/reports/report-export.renderer';
import { ReportExportArtifactStore } from './modules/reports/report-export-artifact.store';
import { ReportExportRenderProcessor } from './modules/reports/report-export-render.processor';
import {
  REPORT_EXPORT_QUEUE_NAME,
  REPORT_EXPORT_QUEUE_PREFIX,
} from './modules/reports/report-export-queue.port';
import { scheduleDatabaseRecovery } from './modules/redis/queue-wakeup';
import { PrismaService } from './database/prisma.service';

// Dedicated unprivileged PDF render process. It never accepts sockets and is
// never the API image; the job database lease stays the single source of truth.
// The same image multiplexes the bounded report-export render worker.
process.env.SERVICE_NAME ??= 'iranyaragh-pdf-render-worker';
const diagnostics = new RedactedLogger();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const invoiceProcessor = new InvoicePdfRenderProcessor(
    app.get(InvoicePdfJobService),
    app.get(PrismaService),
    {
      workerId: resolveWorkerId(config.get('INVOICE_PDF_WORKER_ID', { infer: true })),
      renderTimeoutMs: config.get('INVOICE_PDF_RENDER_TIMEOUT_MS', {
        infer: true,
      }),
      assetsDir: config.get('INVOICE_PDF_ASSETS_DIR', { infer: true }),
    },
  );
  const invoiceWorker = new Worker<{ jobId: string }>(
    INVOICE_PDF_QUEUE_NAME,
    async (job) => {
      if (job.name !== 'render' || typeof job.data.jobId !== 'string') {
        throw new Error('Unsupported invoice PDF render job.');
      }
      await invoiceProcessor.process(job.data.jobId, {
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      });
    },
    {
      connection: { url: config.get('REDIS_URL', { infer: true }) },
      prefix: INVOICE_PDF_QUEUE_PREFIX,
      concurrency: 1,
    },
  );
  observeWorker(invoiceWorker, INVOICE_PDF_QUEUE_NAME);

  const exportProcessor = new ReportExportRenderProcessor(
    app.get(ReportExportJobService),
    app.get(ReportExportRenderer),
    app.get(ReportExportArtifactStore),
    {
      workerId: resolveWorkerId(config.get('REPORT_EXPORT_WORKER_ID', { infer: true })),
      renderTimeoutMs: config.get('REPORT_EXPORT_RENDER_TIMEOUT_MS', {
        infer: true,
      }),
      cleanupIntervalMs: config.get('REPORT_EXPORT_CLEANUP_INTERVAL_MS', {
        infer: true,
      }),
    },
  );
  exportProcessor.start();
  const exportWorker = new Worker<{ jobId: string }>(
    REPORT_EXPORT_QUEUE_NAME,
    async (job) => {
      if (!['export', 'recover'].includes(job.name) || typeof job.data.jobId !== 'string') {
        throw new Error('Unsupported report export render job.');
      }
      await exportProcessor.process(job.data.jobId, {
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      });
    },
    {
      connection: { url: config.get('REDIS_URL', { infer: true }) },
      prefix: REPORT_EXPORT_QUEUE_PREFIX,
      concurrency: 1,
    },
  );
  observeWorker(exportWorker, REPORT_EXPORT_QUEUE_NAME);

  // Redis deliveries are disposable; recurring wake-ups recover pending work
  // and expired database leases after a worker/queue restart or lost enqueue.
  const recoveryQueue = new Queue<{ jobId: string }>(REPORT_EXPORT_QUEUE_NAME, {
    connection: { url: config.get('REDIS_URL', { infer: true }) },
    prefix: REPORT_EXPORT_QUEUE_PREFIX,
  });
  recoveryQueue.on('error', () => diagnostics.event('error', { event: 'worker.recovery.queue.failed', outcome: 'failure' }));
  await scheduleDatabaseRecovery(recoveryQueue);

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await Promise.allSettled([invoiceWorker.close(), exportWorker.close(), recoveryQueue.close()]);
    await exportProcessor.stop();
    await app.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

function resolveWorkerId(
  cooked: EnvironmentVariables['INVOICE_PDF_WORKER_ID'] | EnvironmentVariables['REPORT_EXPORT_WORKER_ID'],
): string {
  if (typeof cooked === 'string' && /^[a-zA-Z0-9_-]{4,64}$/u.test(cooked)) return cooked;
  const hostname = process.env.HOSTNAME ?? '';
  if (/^[a-zA-Z0-9_-]{4,64}$/u.test(hostname)) return hostname;
  return randomUUID().replaceAll('-', '').slice(0, 32);
}

void bootstrap().catch(error => { diagnostics.event('error', { event: 'worker.startup.failed', outcome: 'failure', data: diagnosticException(error) }); process.exit(1); });
