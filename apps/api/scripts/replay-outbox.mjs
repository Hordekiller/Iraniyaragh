import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const eventId = process.argv[2];
const actorId = process.env.OUTBOX_REPLAY_ACTOR_ID;
const ticket = process.env.OUTBOX_REPLAY_TICKET;
if (
  process.env.ALLOW_OUTBOX_REPLAY !== 'true' ||
  process.argv.length !== 3 ||
  !eventId ||
  !actorId ||
  !ticket ||
  !process.env.DATABASE_URL ||
  !process.env.REDIS_URL
) {
  throw new Error(
    'Replay requires an event ID, explicit opt-in, actor, ticket, database and Redis configuration. Run the API build first.',
  );
}

let modules;
try {
  modules = {
    replay: require('../dist/src/modules/outbox/outbox-replay.service.js'),
    queue: require('../dist/src/modules/outbox/bullmq-outbox-replay-queue.adapter.js'),
    prisma: require('../dist/src/database/prisma.service.js'),
    permissions: require('../dist/src/modules/auth/auth-permission.service.js'),
  };
} catch {
  throw new Error('Compiled API output is missing. Run pnpm --filter @iranyaragh/api build first.');
}

const { OutboxReplayService, OUTBOX_REPLAY_PERMISSION } = modules.replay;
const { BullMqOutboxReplayQueue } = modules.queue;
const { PrismaService } = modules.prisma;
const { AuthPermissionService } = modules.permissions;

const prisma = new PrismaService();
const queue = new BullMqOutboxReplayQueue(process.env.REDIS_URL);
const permissionService = new AuthPermissionService(prisma);
const replay = new OutboxReplayService(
  prisma,
  actorId => permissionService.effectivePermissionKeys(actorId),
  queue,
);

try {
  const result = await replay.replay({ eventId, actorId, ticket });
  if (result.outcome === 'REJECTED') {
    process.stderr.write(`Outbox replay refused: ${result.reason}.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Outbox event ${result.eventId} reset for relay (${result.branch}); request ${result.requestId}. ` +
        `Required permission: ${OUTBOX_REPLAY_PERMISSION}.\n`,
    );
  }
} finally {
  await queue.close();
  await prisma.$disconnect();
}
