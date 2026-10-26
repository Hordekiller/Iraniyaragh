import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type DefaultJobOptions } from 'bullmq';
import type { RedisOptions } from 'ioredis';
import Redis from 'ioredis';
import type { EnvironmentVariables } from '../../config/environment';

/**
 * One bounded delivery envelope for every database-authoritative job queue:
 * eligibility, attempt budgets and outcomes stay in Postgres; BullMQ only
 * wakes a worker, so retained or aged replays can never resurrect work that
 * the database lease does not already authorize.
 */
export const BOUNDED_DELIVERY: DefaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: { count: 1_000 },
  removeOnFail: { count: 1_000 },
};

export type WakeupPlan = {
  readonly name: string;
  readonly prefix: string;
  readonly label: string;
  readonly jobName: string;
};

export type Wakeup = {
  readonly queue: Queue<{ jobId: string }>;
  readonly close: () => Promise<void>;
};

/**
 * Open a wake-up channel. IO errors are logged once: a refused connection must
 * never crash the process as an unhandled 'error' event, because the database
 * job row stays authoritative either way and enqueue's rejected promise
 * already carries the outcome back to the requester.
 */
export function openWakeupChannel(plan: WakeupPlan, redisUrl: string, logger: Logger): Wakeup {
  let quiet = false;
  const onceWarn = (topic: string): void => {
    if (quiet) return;
    quiet = true;
    logger.warn(topic);
  };
  const connectionSettings: RedisOptions = {
    connectTimeout: 5_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  };
  const connection = new Redis(redisUrl, connectionSettings);
  connection.on('error', () => onceWarn(`${plan.label}: redis unavailable`));
  const queue = new Queue<{ jobId: string }>(plan.name, {
    connection,
    prefix: plan.prefix,
  });
  queue.on('error', () => onceWarn(`${plan.label}: queue unavailable`));
  return {
    queue,
    close: async (): Promise<void> => {
      try {
        await queue.close();
      } finally {
        connection.disconnect();
      }
    },
  };
}

/** Shared wake-up lifecycle for every DDBA queue domain. */
export class BoundedWakeupQueue {
  private readonly logger: Logger;
  private wake?: Wakeup;

  constructor(
    private readonly plan: WakeupPlan,
    private readonly redisUrl: string,
  ) {
    this.logger = new Logger(`Wakeup(${plan.label})`);
  }

  async enqueue(jobId: string): Promise<void> {
    const wake = (this.wake ??= openWakeupChannel(this.plan, this.redisUrl, this.logger));
    await wake.queue.waitUntilReady();
    await wake.queue.add(this.plan.jobName, { jobId }, { jobId, ...BOUNDED_DELIVERY });
  }

  async onModuleDestroy(): Promise<void> {
    await this.wake?.close();
  }
}

export function wakeupRedisUrl(config: ConfigService<EnvironmentVariables, true>): string {
  return config.get('REDIS_URL', { infer: true }) as string;
}

/** Database recovery also runs when no request delivery survived Redis. */
export async function scheduleDatabaseRecovery(
  queue: Queue<{ jobId: string }>,
  every = 5_000,
): Promise<void> {
  await queue.setGlobalConcurrency(1);
  await queue.upsertJobScheduler(
    'database-recovery',
    { every },
    {
      name: 'recover',
      data: { jobId: 'database-recovery' },
      opts: { removeOnComplete: 10, removeOnFail: 10 },
    },
  );
}
