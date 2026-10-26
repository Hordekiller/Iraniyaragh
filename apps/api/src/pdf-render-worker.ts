import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { EnvironmentVariables } from './config/environment';
import { InvoicePdfJobService } from './modules/invoices/invoice-pdf-job.service';
import { InvoicePdfRenderProcessor } from './modules/invoices/invoice-pdf-render.processor';
import { INVOICE_PDF_QUEUE_NAME, INVOICE_PDF_QUEUE_PREFIX } from './modules/invoices/invoice-pdf-queue.port';
import { PrismaService } from './database/prisma.service';

// Dedicated unprivileged PDF render process. It never accepts sockets and is
// never the API image; the job database lease stays the single source of truth.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);
  const processor = new InvoicePdfRenderProcessor(
    app.get(InvoicePdfJobService),
    app.get(PrismaService),
    {
      workerId: resolveWorkerId(config.get('INVOICE_PDF_WORKER_ID', { infer: true })),
      renderTimeoutMs: config.get('INVOICE_PDF_RENDER_TIMEOUT_MS', { infer: true }),
      assetsDir: config.get('INVOICE_PDF_ASSETS_DIR', { infer: true }),
    },
  );
  const worker = new Worker<{ jobId: string }>(
    INVOICE_PDF_QUEUE_NAME,
    async job => {
      if (job.name !== 'render' || typeof job.data.jobId !== 'string') {
        throw new Error('Unsupported invoice PDF render job.');
      }
      await processor.process(job.data.jobId, {
        finalAttempt: job.attemptsMade + 1 >= (job.opts.attempts ?? 1),
      });
    },
    { connection: { url: config.get('REDIS_URL', { infer: true }) }, prefix: INVOICE_PDF_QUEUE_PREFIX, concurrency: 1 },
  );
  worker.on('error', () => process.stderr.write('Invoice PDF render worker infrastructure error.\n'));
  worker.on('failed', job => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      process.stderr.write('Invoice PDF render attempt dead-lettered; inspect database job evidence.\n');
    }
  });

  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await worker.close();
    await app.close();
  };
  process.once('SIGTERM', () => void close());
  process.once('SIGINT', () => void close());
}

function resolveWorkerId(cooked: EnvironmentVariables['INVOICE_PDF_WORKER_ID']): string {
  if (typeof cooked === 'string' && /^[a-zA-Z0-9_-]{4,64}$/u.test(cooked)) return cooked;
  const hostname = process.env.HOSTNAME ?? '';
  if (/^[a-zA-Z0-9_-]{4,64}$/u.test(hostname)) return hostname;
  return randomUUID().replaceAll('-', '').slice(0, 32);
}

void bootstrap();
