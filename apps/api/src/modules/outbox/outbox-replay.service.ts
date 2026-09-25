import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { OutboxReplayQueue } from './outbox-replay-queue.port';

export const OUTBOX_REPLAY_PERMISSION = 'settings.manage';

// AuditLog.entityId is VarChar(100); a longer identifier would fail at insert.
const EVENT_ID_PATTERN = /^[A-Za-z0-9-]{1,100}$/;
const TICKET_PATTERN = /^[A-Za-z0-9_-]{6,100}$/;

export type OutboxReplayRejection =
  | 'INVALID_INPUT'
  | 'ACTOR_INACTIVE'
  | 'PERMISSION_DENIED'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_CONSUMED'
  | 'EVENT_NOT_REPLAYABLE'
  | 'JOB_ACTIVE'
  | 'CONCURRENT_CHANGE';

export type OutboxReplayBranch = 'dead-letter' | 'stranded';

export type OutboxReplayResult =
  | { outcome: 'REPLAYED'; eventId: string; requestId: string; branch: OutboxReplayBranch }
  | { outcome: 'REJECTED'; reason: OutboxReplayRejection };

export type OutboxReplayInput = { eventId: string; actorId: string; ticket: string };

export type PermissionKeyResolver = (actorId: string) => Promise<ReadonlySet<string>>;

/**
 * Break-glass recovery for exactly one outbox event. It is a database-level tool
 * rather than a request-scoped one, so it demands an explicit opt-in, an active
 * staff actor holding a live permission grant, a non-sensitive incident ticket
 * and a durable audit record for both acceptance and refusal. It never marks an
 * event or effect as delivered.
 */
export class OutboxReplayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionKeys: PermissionKeyResolver,
    private readonly queue: OutboxReplayQueue,
  ) {}

  async replay(input: OutboxReplayInput): Promise<OutboxReplayResult> {
    if (!this.hasValidInput(input)) {
      return this.reject(input, 'INVALID_INPUT');
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: input.actorId },
      select: { status: true },
    });
    if (actor?.status !== 'ACTIVE') {
      return this.reject(input, 'ACTOR_INACTIVE');
    }

    const keys = await this.permissionKeys(input.actorId);
    if (!keys.has(OUTBOX_REPLAY_PERMISSION)) {
      return this.reject(input, 'PERMISSION_DENIED');
    }

    const event = await this.prisma.outboxEvent.findUnique({
      where: { id: input.eventId },
      select: {
        id: true,
        consumedAt: true,
        deadLetteredAt: true,
        processingDeadLetteredAt: true,
        publishedAt: true,
      },
    });
    if (!event) {
      return this.reject(input, 'EVENT_NOT_FOUND');
    }
    if (event.consumedAt) {
      return this.reject(input, 'EVENT_CONSUMED');
    }
    const branch = this.branchOf(event);
    if (!branch) {
      return this.reject(input, 'EVENT_NOT_REPLAYABLE');
    }
    if (!(await this.queue.clearTerminalJob(event.id))) {
      return this.reject(input, 'JOB_ACTIVE');
    }

    const requestId = randomUUID();
    const reset = await this.prisma.$transaction(async tx => {
      const result = await tx.outboxEvent.updateMany({
        where: {
          id: event.id,
          consumedAt: null,
          OR: [
            { deadLetteredAt: { not: null } },
            { processingDeadLetteredAt: { not: null } },
            { publishedAt: { not: null } },
          ],
        },
        data: {
          availableAt: new Date(),
          publishedAt: null,
          attempts: 0,
          deadLetteredAt: null,
          lastErrorCode: null,
          processingDeadLetteredAt: null,
          lastProcessingErrorCode: null,
        },
      });
      if (result.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: 'outbox.replay.requested',
          entityType: 'OutboxEvent',
          entityId: event.id,
          requestId,
          metadata: { ticket: input.ticket, branch },
        },
      });
      return true;
    });
    if (!reset) {
      return this.reject(input, 'CONCURRENT_CHANGE');
    }
    return { outcome: 'REPLAYED', eventId: event.id, requestId, branch };
  }

  private hasValidInput(input: OutboxReplayInput): boolean {
    return (
      typeof input.eventId === 'string' &&
      EVENT_ID_PATTERN.test(input.eventId) &&
      typeof input.actorId === 'string' &&
      input.actorId.length > 0 &&
      typeof input.ticket === 'string' &&
      TICKET_PATTERN.test(input.ticket)
    );
  }

  private branchOf(event: {
    deadLetteredAt: Date | null;
    processingDeadLetteredAt: Date | null;
    publishedAt: Date | null;
  }): OutboxReplayBranch | null {
    if (event.deadLetteredAt || event.processingDeadLetteredAt) return 'dead-letter';
    if (event.publishedAt) return 'stranded';
    return null;
  }

  private async reject(input: OutboxReplayInput, reason: OutboxReplayRejection): Promise<OutboxReplayResult> {
    const entityId =
      typeof input.eventId === 'string' && EVENT_ID_PATTERN.test(input.eventId) ? input.eventId : null;
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId || null,
          action: 'outbox.replay.rejected',
          entityType: 'OutboxEvent',
          entityId,
          requestId: randomUUID(),
          metadata: { ticket: input.ticket ?? null, reason },
        },
      });
    } catch {
      // Refusal is the safe outcome; an audit storage failure must not mask it.
    }
    return { outcome: 'REJECTED', reason };
  }
}
