import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { PrismaService } from '../../database/prisma.service';
import { startOrderExpiryRuntime } from './order-expiry-runtime';

const mock = vi.hoisted(() => ({
  process: undefined as undefined | ((job: Job<{ orderId?: string }>) => Promise<void>),
  get: vi.fn(), set: vi.fn(), addBulk: vi.fn(), counts: vi.fn(), scheduler: vi.fn(),
  removeScheduler: vi.fn(), concurrency: vi.fn(), queueClose: vi.fn(), workerClose: vi.fn(),
}));
vi.mock('bullmq', () => ({
  Queue: class {
    getBackend = () => ({ client: Promise.resolve({ get: mock.get, set: mock.set }) });
    getJobCounts = mock.counts;
    addBulk = mock.addBulk;
    upsertJobScheduler = mock.scheduler;
    removeJobScheduler = mock.removeScheduler;
    setGlobalConcurrency = mock.concurrency;
    close = mock.queueClose;
    on = vi.fn();
  },
  Worker: class {
    constructor(_name: string, processor: typeof mock.process) { mock.process = processor; }
    close = mock.workerClose;
    on = vi.fn();
  },
}));

const dispatch = () => mock.process!({ name: 'dispatch', data: {}, attemptsMade: 0, id: 'dispatch-1' } as Job<{ orderId?: string }>);

describe('durable order expiry orchestration', () => {
  const findMany = vi.fn();
  const expire = vi.fn();
  const report = vi.fn();
  const start = (enabled = true) => startOrderExpiryRuntime({
    redisUrl: 'redis://127.0.0.1:6379', enabled, report,
    prisma: { order: { findMany } } as unknown as Pick<PrismaService, 'order'>,
    commands: { expireAbandonedOrderAsSystem: expire },
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mock.process = undefined;
    mock.get.mockResolvedValue(null);
    mock.counts.mockResolvedValue({ wait: 0, active: 1, delayed: 0 });
    findMany.mockResolvedValue([]);
  });

  it('disables periodic generation without deleting existing job evidence', async () => {
    const runtime = await start(false);
    expect(mock.removeScheduler).toHaveBeenCalledWith('abandoned-order-dispatch');
    expect(mock.process).toBeUndefined();
    expect(findMany).not.toHaveBeenCalled();
    await runtime.close();
    expect(mock.queueClose).toHaveBeenCalledOnce();
  });

  it('uses a durable scheduler with bounded retry and queue-wide serialization', async () => {
    const runtime = await start();
    expect(mock.concurrency).toHaveBeenCalledWith(1);
    expect(mock.scheduler).toHaveBeenCalledWith('abandoned-order-dispatch', { every: 60_000 }, expect.objectContaining({
      opts: expect.objectContaining({ attempts: 5, backoff: { type: 'exponential', delay: 1_000 } }),
    }));
    await runtime.close();
    expect(mock.workerClose).toHaveBeenCalledOnce();
  });

  it('retains its cursor after partial enqueue failure and generates stable retry IDs', async () => {
    findMany.mockResolvedValue([{ id: 'order-1' }]);
    await start();
    mock.addBulk.mockRejectedValueOnce(new Error('private redis URL'));
    await expect(dispatch()).rejects.toThrow('Order expiry processing failed');
    expect(mock.set).not.toHaveBeenCalled();
    await dispatch();
    expect(mock.addBulk.mock.calls[0][0]).toEqual(mock.addBulk.mock.calls[1][0]);
    expect(mock.set).toHaveBeenCalledWith(expect.any(String), 'order-1');
    expect(mock.addBulk.mock.calls[1][0][0].opts).toMatchObject({ attempts: 5, removeOnFail: { count: 1_000 } });
  });

  it('continues past retained poison orders and wraps after a complete page cycle', async () => {
    mock.get.mockResolvedValue('poison-order');
    await start();
    await dispatch();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: { gt: 'poison-order' }, payments: { none: {} }, status: 'PENDING_PAYMENT',
    }), take: 100 }));
    expect(mock.set).toHaveBeenCalledWith(expect.any(String), '');
  });

  it('limits each dispatch by remaining backlog capacity and stops when saturated', async () => {
    mock.counts.mockResolvedValueOnce({ wait: 190, active: 1, delayed: 5 });
    await start();
    await dispatch();
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 4 }));
    findMany.mockClear();
    mock.counts.mockResolvedValue({ wait: 199, active: 1, delayed: 0 });
    await dispatch();
    expect(findMany).not.toHaveBeenCalled();
    expect(mock.set).toHaveBeenCalledTimes(1);
  });

  it('rechecks one order through the domain command and strips sensitive errors', async () => {
    await start();
    const job = { name: 'expire', data: { orderId: 'order-1' }, attemptsMade: 2, id: 'job-1' } as Job<{ orderId?: string }>;
    expire.mockRejectedValueOnce(new Error('private customer data and credentials'));
    await expect(mock.process!(job)).rejects.toThrow(/^Order expiry processing failed;/);
    expect(report.mock.calls.flat().join('')).not.toContain('private');
    expire.mockResolvedValue(false);
    await mock.process!(job);
    expect(expire).toHaveBeenCalledWith('order-1', expect.stringMatching(/^expiry-[a-f0-9]{64}$/));
    expect(report).toHaveBeenLastCalledWith('Order expiry expired=0 noop=1');
  });

  it('rejects malformed work before domain access and fails startup safely', async () => {
    await start();
    await expect(mock.process!({ name: 'expire', data: { orderId: '../private' } } as Job<{ orderId?: string }>)).rejects.toThrow('Order expiry processing failed');
    expect(expire).not.toHaveBeenCalled();
    mock.scheduler.mockRejectedValueOnce(new Error('redis://private-secret'));
    await expect(start()).rejects.toThrow(/^Order expiry runtime initialization failed\.$/);
    expect(mock.queueClose).toHaveBeenCalledOnce();
  });
});
