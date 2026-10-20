import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import type { PrismaService } from '../../database/prisma.service';
import type { OrderCommandService } from './order-command.service';

export const ORDER_EXPIRY_QUEUE_NAME = 'order-reservation-expiry';
export const ORDER_EXPIRY_SCHEDULER_ID = 'abandoned-order-dispatch';
const PAGE_SIZE = 100;
const MAX_BACKLOG = 200;
const ATTEMPTS = 5;
type ExpiryJobData = { orderId?: string };

/** Redis persists delivery/cursor/retries; PostgreSQL owns eligibility and exact-once effects. */
export async function startOrderExpiryRuntime(options: {
  redisUrl: string;
  enabled: boolean;
  prisma: Pick<PrismaService, 'order'>;
  commands: Pick<OrderCommandService, 'expireAbandonedOrderAsSystem'>;
  prefix?: string;
  report?: (line: string) => void;
}): Promise<{ close(): Promise<void> }> {
  const prefix = options.prefix ?? 'iranyaragh';
  const report = options.report ?? ((line: string) => { process.stdout.write(`${line}\n`); });
  const connection = { url: options.redisUrl };
  const queue = new Queue<ExpiryJobData>(ORDER_EXPIRY_QUEUE_NAME, { connection, prefix });
  const cursorKey = `${prefix}:${ORDER_EXPIRY_QUEUE_NAME}:dispatch-cursor`;
  const retained = { count: 1_000 };
  queue.on('error', () => report('Order expiry queue infrastructure error.'));
  let worker: Worker<ExpiryJobData> | undefined;
  try {
    if (!options.enabled) {
      // Preserve existing jobs/evidence, but stop generating new work after disable/restart.
      await queue.removeJobScheduler(ORDER_EXPIRY_SCHEDULER_ID);
    } else {
      // This is a queue-wide limit, including across multiple worker processes.
      await queue.setGlobalConcurrency(1);
      await queue.upsertJobScheduler(ORDER_EXPIRY_SCHEDULER_ID, { every: 60_000 }, {
        name: 'dispatch', data: {}, opts: {
          attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: retained, removeOnFail: retained,
        },
      });
      worker = new Worker<ExpiryJobData>(ORDER_EXPIRY_QUEUE_NAME, async (job: Job<ExpiryJobData>) => {
        try {
          if (job.name === 'dispatch') {
            const counts = await queue.getJobCounts('wait', 'active', 'delayed');
            const backlog = counts.wait + counts.active + counts.delayed;
            if (backlog >= MAX_BACKLOG) {
              report('Order expiry backpressure=1');
              return;
            }
            const redis = await queue.getBackend().client;
            const cursor = await redis.get(cursorKey);
            if (cursor && !/^[A-Za-z0-9_-]{1,128}$/.test(cursor)) {
              throw new Error('Invalid expiry cursor.');
            }
            const candidates = await options.prisma.order.findMany({
              where: {
                status: 'PENDING_PAYMENT', reservationExpiresAt: { lte: new Date() },
                payments: { none: {} }, ...(cursor ? { id: { gt: cursor } } : {}),
              },
              select: { id: true }, orderBy: { id: 'asc' }, take: Math.min(PAGE_SIZE, MAX_BACKLOG - backlog),
            });
            // IDs are stable across dispatch retries and scheduler/worker restarts.
            await queue.addBulk(candidates.map(({ id }) => ({
              name: 'expire', data: { orderId: id }, opts: {
                jobId: `expiry-${createHash('sha256').update(id).digest('hex')}`,
                attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 1_000 },
                removeOnComplete: retained, removeOnFail: retained,
              },
            })));
            // Advance only after enqueue succeeds. Rotate past retained poison jobs.
            await redis.set(cursorKey, candidates.at(-1)?.id ?? '');
            report(`Order expiry selected=${candidates.length}`);
            return;
          }
          if (job.name !== 'expire' || typeof job.data?.orderId !== 'string' ||
            !/^[A-Za-z0-9_-]{1,128}$/.test(job.data.orderId)) {
            throw new Error('Unsupported order expiry job.');
          }
          const correlation = createHash('sha256').update(`${job.id}:${job.attemptsMade}`).digest('hex');
          const expired = await options.commands.expireAbandonedOrderAsSystem(job.data.orderId, `expiry-${correlation}`);
          report(`Order expiry expired=${Number(expired)} noop=${Number(!expired)}`);
        } catch {
          // BullMQ persists failure messages and stack traces. Never pass through DB/Redis errors.
          throw new Error('Order expiry processing failed; inspect expiry dead letters and domain evidence.');
        }
      }, { connection, prefix, concurrency: 1 });
      worker.on('error', () => report('Order expiry worker infrastructure error.'));
      worker.on('failed', (job) => {
        if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
          report('Order expiry dead_lettered=1; reconcile before retrying.');
        }
      });
    }
  } catch {
    await worker?.close();
    await queue.close();
    throw new Error('Order expiry runtime initialization failed.');
  }
  return { async close() { await worker?.close(); await queue.close(); } };
}
