import { Module } from '@nestjs/common';
import { FakePaymentGateway, PAYMENT_GATEWAY } from './payment-gateway';
import { PaymentsController } from './payments.controller';
import { PaymentService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentService,
    { provide: PAYMENT_GATEWAY, useClass: FakePaymentGateway },
  ],
  exports: [PaymentService],
})
export class PaymentsModule {}
