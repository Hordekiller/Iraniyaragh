import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { OUTBOX_REPLAY_PERMISSION, OutboxReplayService } from './outbox-replay.service';

type EventRow = {
  id: string;
  consumedAt: Date | null;
  deadLetteredAt: Date | null;
  processingDeadLetteredAt: Date | null;
  publishedAt: Date | null;
};

const input = { eventId: 'event-1', actorId: 'user-1', ticket: 'INC-1234' };

function setup(event: EventRow | null = {
  id: 'event-1',
  consumedAt: null,
  deadLetteredAt: new Date('2026-01-01T00:00:00.000Z'),
  processingDeadLetteredAt: null,
  publishedAt: new Date('2026-01-01T00:00:00.000Z'),
}) {
  const auditCreate = vi.fn(async () => ({}));
  const resetCount = { value: 1 };
  const tx = {
    outboxEvent: {
      updateMany: vi.fn(async () => ({ count: resetCount.value })),
    },
    auditLog: { create: auditCreate },
  };
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ status: 'ACTIVE' })) },
    outboxEvent: { findUnique: vi.fn(async () => event) },
    auditLog: { create: auditCreate },
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<boolean>) => callback(tx)),
  };
  const permissionKeys = vi.fn(async () => new Set([OUTBOX_REPLAY_PERMISSION]));
  const queue = { clearTerminalJob: vi.fn(async () => true) };
  const service = new OutboxReplayService(
    prisma as unknown as PrismaService,
    permissionKeys,
    queue,
  );
  return { prisma, tx, permissionKeys, queue, service, resetCount };
}

describe('OutboxReplayService', () => {
  it('resets an investigated dead-letter event and audits the acceptance in the same transaction', async () => {
    const { service, tx } = setup();
    await expect(service.replay(input)).resolves.toMatchObject({
      outcome: 'REPLAYED',
      eventId: 'event-1',
      branch: 'dead-letter',
    });
    expect(tx.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        consumedAt: null,
        OR: [
          { deadLetteredAt: { not: null } },
          { processingDeadLetteredAt: { not: null } },
          { publishedAt: { not: null } },
        ],
      },
      data: {
        availableAt: expect.any(Date),
        publishedAt: null,
        attempts: 0,
        deadLetteredAt: null,
        lastErrorCode: null,
        processingDeadLetteredAt: null,
        lastProcessingErrorCode: null,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'outbox.replay.requested',
        entityType: 'OutboxEvent',
        entityId: 'event-1',
        requestId: expect.any(String),
        metadata: { ticket: 'INC-1234', branch: 'dead-letter' },
      },
    });
  });

  it('recovers a stranded event that was published but never consumed', async () => {
    const { service } = setup({
      id: 'event-1',
      consumedAt: null,
      deadLetteredAt: null,
      processingDeadLetteredAt: null,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await expect(service.replay(input)).resolves.toMatchObject({ outcome: 'REPLAYED', branch: 'stranded' });
  });

  it('recovers a processing dead letter without a queue row', async () => {
    const { service, queue } = setup({
      id: 'event-1',
      consumedAt: null,
      deadLetteredAt: null,
      processingDeadLetteredAt: new Date('2026-01-01T00:00:00.000Z'),
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    queue.clearTerminalJob.mockResolvedValueOnce(true);
    await expect(service.replay(input)).resolves.toMatchObject({ outcome: 'REPLAYED', branch: 'dead-letter' });
  });

  it.each([
    ['an invalid ticket', { ...input, ticket: '../etc' }],
    ['an event id longer than the audit column', { ...input, eventId: 'e'.repeat(101) }],
    ['a missing actor', { ...input, actorId: '' }],
  ])('refuses %s before touching the database', async (_label, invalid) => {
    const { service, prisma } = setup();
    await expect(service.replay(invalid)).resolves.toEqual({ outcome: 'REJECTED', reason: 'INVALID_INPUT' });
    expect(prisma.outboxEvent.findUnique).not.toHaveBeenCalled();
  });

  it('audits a refusal without an entity for invalid input', async () => {
    const { service, prisma } = setup();
    await service.replay({ ...input, eventId: 'e'.repeat(101) });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'outbox.replay.rejected',
        entityType: 'OutboxEvent',
        entityId: null,
        requestId: expect.any(String),
        metadata: { ticket: 'INC-1234', reason: 'INVALID_INPUT' },
      },
    });
  });

  it('refuses an inactive actor before any state read', async () => {
    const { service, prisma, permissionKeys } = setup();
    prisma.user.findUnique.mockResolvedValueOnce({ status: 'SUSPENDED' });
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'ACTOR_INACTIVE' });
    expect(permissionKeys).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.findUnique).not.toHaveBeenCalled();
  });

  it('refuses an unknown actor', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'ACTOR_INACTIVE' });
  });

  it('refuses an actor without a live permission grant', async () => {
    const { service, prisma, permissionKeys } = setup();
    permissionKeys.mockResolvedValueOnce(new Set(['catalog.read']));
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'PERMISSION_DENIED' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'outbox.replay.rejected' }),
      }),
    );
  });

  it('refuses an unknown event', async () => {
    const { service } = setup(null);
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'EVENT_NOT_FOUND' });
  });

  it('refuses a consumed event', async () => {
    const { service, tx } = setup({
      id: 'event-1',
      consumedAt: new Date('2026-01-01T00:00:00.000Z'),
      deadLetteredAt: new Date('2026-01-01T00:00:00.000Z'),
      processingDeadLetteredAt: null,
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'EVENT_CONSUMED' });
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('refuses an event that is neither dead-lettered nor stranded', async () => {
    const { service, tx } = setup({
      id: 'event-1',
      consumedAt: null,
      deadLetteredAt: null,
      processingDeadLetteredAt: null,
      publishedAt: null,
    });
    await expect(service.replay(input)).resolves.toEqual({
      outcome: 'REJECTED',
      reason: 'EVENT_NOT_REPLAYABLE',
    });
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('refuses while a queue job is still active', async () => {
    const { service, queue, tx } = setup();
    queue.clearTerminalJob.mockResolvedValueOnce(false);
    await expect(service.replay(input)).resolves.toEqual({ outcome: 'REJECTED', reason: 'JOB_ACTIVE' });
    expect(tx.outboxEvent.updateMany).not.toHaveBeenCalled();
  });

  it('refuses when the event changed concurrently and commits no audit of acceptance', async () => {
    const { service, tx, resetCount } = setup();
    resetCount.value = 0;
    await expect(service.replay(input)).resolves.toEqual({
      outcome: 'REJECTED',
      reason: 'CONCURRENT_CHANGE',
    });
    expect(tx.auditLog.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'outbox.replay.requested' }) }),
    );
  });

  it('still refuses when the refusal audit cannot be stored', async () => {
    const { service, prisma } = setup();
    prisma.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'));
    await expect(service.replay({ ...input, ticket: 'no' })).resolves.toEqual({
      outcome: 'REJECTED',
      reason: 'INVALID_INPUT',
    });
  });

  it('resets only relay state and never an acknowledgement or effect', async () => {
    const { service, tx } = setup();
    await service.replay(input);
    const reset = tx.outboxEvent.updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(Object.keys(reset.data).sort()).toEqual([
      'attempts',
      'availableAt',
      'deadLetteredAt',
      'lastErrorCode',
      'lastProcessingErrorCode',
      'processingDeadLetteredAt',
      'publishedAt',
    ]);
  });
});
