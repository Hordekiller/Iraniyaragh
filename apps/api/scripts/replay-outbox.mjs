import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';

const eventId = process.argv[2];
const actorId = process.env.OUTBOX_REPLAY_ACTOR_ID;
const ticket = process.env.OUTBOX_REPLAY_TICKET;
if (
  process.env.ALLOW_OUTBOX_REPLAY !== 'true' ||
  process.argv.length !== 3 ||
  !/^[A-Za-z0-9-]{8,128}$/.test(eventId ?? '') ||
  !actorId ||
  !/^[A-Za-z0-9_-]{6,100}$/.test(ticket ?? '') ||
  !process.env.DATABASE_URL ||
  !process.env.REDIS_URL
) {
  throw new Error('Replay requires an event ID, explicit opt-in, actor, ticket, database and Redis configuration.');
}

const prisma = new PrismaClient();
const queue = new Queue('commerce-outbox', {
  connection: { url: process.env.REDIS_URL, connectTimeout: 5_000, maxRetriesPerRequest: 1 },
  prefix: 'iranyaragh',
});

try {
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { status: true } });
  if (actor?.status !== 'ACTIVE') throw new Error('Replay actor must be active.');
  const now = new Date();
  const privilegedAssignment = await prisma.userRole.findFirst({
    where: {
      userId: actorId,
      revokedAt: null,
      assignedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      role: {
        isActive: true,
        permissions: {
          some: {
            revokedAt: null,
            grantedAt: { lte: now },
            permission: { key: 'settings.manage', isActive: true },
          },
        },
      },
    },
    select: { id: true },
  });
  if (!privilegedAssignment) throw new Error('Replay actor lacks settings.manage.');

  const event = await prisma.outboxEvent.findUnique({
    where: { id: eventId },
    select: { id: true, consumedAt: true, deadLetteredAt: true, processingDeadLetteredAt: true },
  });
  if (!event || event.consumedAt || (!event.deadLetteredAt && !event.processingDeadLetteredAt)) {
    throw new Error('Only an existing, unconsumed dead-letter event can be replayed.');
  }

  const job = await queue.getJob(eventId);
  if (job) {
    const state = await job.getState();
    if (state !== 'failed' && state !== 'completed') {
      throw new Error('Outbox job is still active or queued; replay is unsafe.');
    }
    await job.remove();
  }

  const requestId = randomUUID();
  const replayed = await prisma.$transaction(async tx => {
    const result = await tx.outboxEvent.updateMany({
      where: {
        id: eventId,
        consumedAt: null,
        OR: [
          { deadLetteredAt: { not: null } },
          { processingDeadLetteredAt: { not: null } },
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
        actorId,
        action: 'outbox.replay.requested',
        entityType: 'OutboxEvent',
        entityId: eventId,
        requestId,
        metadata: { ticket },
      },
    });
    return true;
  });
  if (!replayed) throw new Error('Outbox event changed concurrently; replay was not accepted.');
  process.stdout.write(`Outbox event ${eventId} reset for relay; request ${requestId}.\n`);
} finally {
  await queue.close();
  await prisma.$disconnect();
}
