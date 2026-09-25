import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OUTBOX_QUEUE, type OutboxQueue } from './outbox-queue.port';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 8;
const MAX_BACKOFF_MS = 15 * 60_000;

type ClaimedEvent = { id: string; attempts: number };

@Injectable()
export class OutboxRelayService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(OUTBOX_QUEUE) private readonly queue: OutboxQueue,
  ) {}

  /** One bounded pass; callers must avoid overlapping runs in one process. */
  async dispatchBatch(): Promise<{ claimed: number; published: number; deadLettered: number }> {
    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>(Prisma.sql`
      WITH picked AS (
        SELECT "id" FROM "OutboxEvent"
        WHERE "publishedAt" IS NULL
          AND "deadLetteredAt" IS NULL
          AND "availableAt" <= CURRENT_TIMESTAMP
        ORDER BY "availableAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
      )
      UPDATE "OutboxEvent" AS event
      SET "attempts" = event."attempts" + 1,
          "availableAt" = CURRENT_TIMESTAMP + INTERVAL '60 seconds'
      FROM picked
      WHERE event."id" = picked."id"
      RETURNING event."id", event."attempts"
    `);

    let published = 0;
    let deadLettered = 0;
    for (const event of claimed) {
      try {
        await this.queue.enqueue(event.id);
        const result = await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, attempts: event.attempts, publishedAt: null, deadLetteredAt: null },
          data: { publishedAt: new Date(), lastErrorCode: null },
        });
        published += result.count;
      } catch (error) {
        const terminal = event.attempts >= MAX_ATTEMPTS;
        const backoff = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** (event.attempts - 1));
        const result = await this.prisma.outboxEvent.updateMany({
          where: { id: event.id, attempts: event.attempts, publishedAt: null, deadLetteredAt: null },
          data: {
            availableAt: new Date(Date.now() + backoff),
            deadLetteredAt: terminal ? new Date() : null,
            lastErrorCode: safeErrorCode(error),
          },
        });
        if (terminal) deadLettered += result.count;
      }
    }
    return { claimed: claimed.length, published, deadLettered };
  }
}

function safeErrorCode(error: unknown): string {
  // Error messages can contain Redis URLs or event data. Persist only a class name.
  const name = error instanceof Error ? error.name : 'UnknownError';
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'UnknownError';
}
