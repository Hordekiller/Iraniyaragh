import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Worker } from 'bullmq';
import { expect, it } from 'vitest';
import { openWakeupChannel, scheduleDatabaseRecovery } from './queue-wakeup';

it('recovers database work after consumer restart without an HTTP enqueue and bounds concurrency', async () => {
  const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const prefix = `report-test-${randomUUID()}`;
  const plan = { prefix, name: 'recovery', label: 'isolated recovery test', jobName: 'export' };
  const channel = openWakeupChannel(plan, redisUrl, new Logger('RecoveryTest'));
  let worker: Worker | undefined;
  try {
    await scheduleDatabaseRecovery(channel.queue, 100);
    expect(await channel.queue.getGlobalConcurrency()).toBe(1);
    for (let restart = 0; restart < 2; restart++) {
      let pendingDatabaseWork = true;
      const recovered = new Promise<void>((resolve) => {
        worker = new Worker(
          plan.name,
          async (job) => {
            expect(job.name).toBe('recover');
            if (pendingDatabaseWork) {
              pendingDatabaseWork = false;
              resolve();
            }
          },
          { connection: { url: redisUrl }, prefix, concurrency: 1 },
        );
      });
      let timer: NodeJS.Timeout;
      await Promise.race([
        recovered,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Database recovery wake-up did not arrive.')), 5000);
        }),
      ]).finally(() => clearTimeout(timer));
      await worker!.close();
      worker = undefined;
    }
  } finally {
    await worker?.close();
    await channel.queue.obliterate({ force: true });
    await channel.close();
  }
});
