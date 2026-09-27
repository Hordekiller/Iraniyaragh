import { Module } from '@nestjs/common';
import { BullMqOutboxQueue } from './bullmq-outbox-queue.adapter';
import { OUTBOX_QUEUE } from './outbox-queue.port';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxConsumerService } from './outbox-consumer.service';
import { SmsTransportModule } from '../notifications/sms-transport.module';
import { CustomerSmsDeliveryService } from '../notifications/customer-sms-delivery.service';

@Module({
  imports: [SmsTransportModule],
  providers: [
    BullMqOutboxQueue,
    { provide: OUTBOX_QUEUE, useExisting: BullMqOutboxQueue },
    OutboxRelayService,
    OutboxConsumerService,
    CustomerSmsDeliveryService,
  ],
  exports: [OutboxRelayService, OutboxConsumerService, CustomerSmsDeliveryService],
})
export class OutboxModule {}
