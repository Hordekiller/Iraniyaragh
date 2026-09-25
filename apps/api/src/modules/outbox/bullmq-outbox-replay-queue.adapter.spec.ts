import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queueMock, QueueMock } = vi.hoisted(() => {
  const queueMock = { getJob: vi.fn(), close: vi.fn(async () => undefined) };
  function QueueStub() {
    return queueMock;
  }
  return { queueMock, QueueMock: vi.fn(QueueStub) };
});

vi.mock('bullmq', () => ({ Queue: QueueMock }));

import { BullMqOutboxReplayQueue } from './bullmq-outbox-replay-queue.adapter';
import { OUTBOX_QUEUE_NAME, OUTBOX_QUEUE_PREFIX } from './outbox-queue.port';

describe('BullMqOutboxReplayQueue', () => {
  beforeEach(() => {
    queueMock.getJob.mockReset();
  });

  it('connects to the same bounded queue the relay publishes to', () => {
    new BullMqOutboxReplayQueue('redis://queue:6379');
    expect(QueueMock).toHaveBeenCalledWith(OUTBOX_QUEUE_NAME, {
      connection: {
        url: 'redis://queue:6379',
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      prefix: OUTBOX_QUEUE_PREFIX,
    });
  });

  it('accepts an event with no retained job', async () => {
    queueMock.getJob.mockResolvedValueOnce(undefined);
    await expect(new BullMqOutboxReplayQueue('redis://queue:6379').clearTerminalJob('event-1')).resolves.toBe(
      true,
    );
  });

  it.each(['failed', 'completed'])('clears a retained %s job', async state => {
    const remove = vi.fn(async () => undefined);
    queueMock.getJob.mockResolvedValueOnce({ getState: vi.fn(async () => state), remove });
    await expect(new BullMqOutboxReplayQueue('redis://queue:6379').clearTerminalJob('event-1')).resolves.toBe(
      true,
    );
    expect(remove).toHaveBeenCalled();
  });

  it.each(['waiting', 'active', 'delayed'])('refuses while the job is %s', async state => {
    const remove = vi.fn(async () => undefined);
    queueMock.getJob.mockResolvedValueOnce({ getState: vi.fn(async () => state), remove });
    await expect(new BullMqOutboxReplayQueue('redis://queue:6379').clearTerminalJob('event-1')).resolves.toBe(
      false,
    );
    expect(remove).not.toHaveBeenCalled();
  });

  it('closes the queue connection', async () => {
    await new BullMqOutboxReplayQueue('redis://queue:6379').close();
    expect(queueMock.close).toHaveBeenCalled();
  });
});
