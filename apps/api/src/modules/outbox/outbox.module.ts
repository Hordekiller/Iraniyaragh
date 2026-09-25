import { Module } from '@nestjs/common';
import { BullMqOutboxQueue } from './bullmq-outbox-queue.adapter';
import { OUTBOX_QUEUE } from './outbox-queue.port';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxConsumerService } from './outbox-consumer.service';

@Module({
  providers: [
    BullMqOutboxQueue,
    { provide: OUTBOX_QUEUE, useExisting: BullMqOutboxQueue },
    OutboxRelayService,
    OutboxConsumerService,
  ],
  exports: [OutboxRelayService, OutboxConsumerService],
})
export class OutboxModule {}
