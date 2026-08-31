import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../database/prisma.service';
import { HealthService } from './health.service';

function createSubject() {
  const queryRaw = vi.fn();
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;

  return { queryRaw, subject: new HealthService(prisma) };
}

describe('HealthService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports process liveness without querying the database', () => {
    const { queryRaw, subject } = createSubject();

    expect(subject.getLiveness()).toMatchObject({
      status: 'ok',
      service: 'iranyaragh-api',
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('reports ready only after the database probe succeeds', async () => {
    const { queryRaw, subject } = createSubject();
    queryRaw.mockResolvedValue([{ ready: 1 }]);

    await expect(subject.getReadiness()).resolves.toMatchObject({
      status: 'ready',
      checks: { database: { status: 'up' } },
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it('returns a stable safe report when the database probe fails', async () => {
    const { queryRaw, subject } = createSubject();
    queryRaw.mockRejectedValue(new Error('password=do-not-expose host=db.internal'));

    const report = await subject.getReadiness();

    expect(report).toMatchObject({
      status: 'not_ready',
      checks: { database: { status: 'down' } },
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Required dependency is unavailable',
      },
    });
    expect(JSON.stringify(report)).not.toContain('do-not-expose');
    expect(JSON.stringify(report)).not.toContain('db.internal');
  });

  it('fails the readiness probe within its bounded timeout', async () => {
    vi.useFakeTimers();
    const { queryRaw, subject } = createSubject();
    queryRaw.mockReturnValue(new Promise(() => undefined));

    const reportPromise = subject.getReadiness();
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(reportPromise).resolves.toMatchObject({
      status: 'not_ready',
      checks: { database: { status: 'down' } },
    });
  });
});
