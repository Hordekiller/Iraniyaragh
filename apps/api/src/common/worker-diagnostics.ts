import { createHash } from 'node:crypto';
import type { Worker } from 'bullmq';
import { diagnosticException } from '@iranyaragh/contracts';
import { RedactedLogger } from './redacted-logger';

/** Queue lifecycle only; payment/SMS/business acceptance remains domain-owned. */
export function observeWorker(worker: Pick<Worker, 'on'>, queue: string): void {
  const logger = new RedactedLogger();
  worker.on('error', (error) =>
    logger.event('error', {
      event: 'worker.connection.failed',
      outcome: 'failure',
      data: { queue, ...diagnosticException(error) },
    }),
  );
  worker.on('failed', (job, error) =>
    logger.event('error', {
      event: 'worker.delivery.failed',
      outcome: 'failure',
      data: {
        queue,
        jobRef: job?.id
          ? createHash('sha256').update(job.id).digest('hex').slice(0, 16)
          : undefined,
        attempt: job?.attemptsMade,
        exhausted: job ? job.attemptsMade >= (job.opts.attempts ?? 1) : undefined,
        ...diagnosticException(error),
      },
    }),
  );
}
