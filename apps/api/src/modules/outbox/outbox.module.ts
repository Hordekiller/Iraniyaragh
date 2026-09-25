import { Module } from '@nestjs/common';
import { BullMqOutboxQueue } from './bullmq-outbox-queue.adapter';
import { OUTBOX_QUEUE } from './outbox-queue.port';
import { OutboxRelayService } from './outbox-relay.service';

@Module({
  providers: [
    BullMqOutboxQueue,
    { provide: OUTBOX_QUEUE, useExisting: BullMqOutboxQueue },
    OutboxRelayService,
  ],
  exports: [OutboxRelayService],
})
export class OutboxModule {}
