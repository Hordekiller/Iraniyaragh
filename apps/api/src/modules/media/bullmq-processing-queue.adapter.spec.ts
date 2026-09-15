import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentVariables } from '../../config/environment';
import { BullMqProductMediaProcessingQueue } from './bullmq-processing-queue.adapter';

const queueMocks = vi.hoisted(() => ({ add: vi.fn(), close: vi.fn(), constructor: vi.fn() }));
vi.mock('bullmq', () => ({
  Queue: class Queue {
    constructor(name: string, options: unknown) {
      queueMocks.constructor(name, options);
    }

    add = queueMocks.add;
    close = queueMocks.close;
  },
}));

describe('BullMqProductMediaProcessingQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  function queue() {
    const config = new ConfigService<EnvironmentVariables, true>({
      REDIS_URL: 'redis://127.0.0.1:6379',
    } as EnvironmentVariables);
    return new BullMqProductMediaProcessingQueue(config);
  }

  it('uses a bounded retry policy and stable media id as job id', async () => {
    queueMocks.add.mockResolvedValue(undefined);
    const adapter = queue();

    await adapter.enqueue({ mediaId: 'media-1', objectKey: 'quarantine/products/p1/media-1/n.jpg' });

    expect(queueMocks.constructor).toHaveBeenCalledWith(
      'product-media-processing',
      expect.objectContaining({
        prefix: 'iranyaragh',
        defaultJobOptions: expect.objectContaining({ attempts: 4, removeOnFail: false }),
      }),
    );
    expect(queueMocks.add).toHaveBeenCalledWith(
      'process',
      { mediaId: 'media-1', objectKey: 'quarantine/products/p1/media-1/n.jpg' },
      { jobId: 'media-1' },
    );
  });

  it('closes its queue during module shutdown', async () => {
    queueMocks.add.mockResolvedValue(undefined);
    queueMocks.close.mockResolvedValue(undefined);
    const adapter = queue();
    await adapter.enqueue({ mediaId: 'media-1', objectKey: 'quarantine/products/p1/media-1/n.jpg' });
    await adapter.onModuleDestroy();
    expect(queueMocks.close).toHaveBeenCalledOnce();
  });

  it('does not open a Redis connection until a job is enqueued', async () => {
    const adapter = queue();
    expect(queueMocks.constructor).not.toHaveBeenCalled();
    await adapter.onModuleDestroy();
    expect(queueMocks.close).not.toHaveBeenCalled();
  });
});
