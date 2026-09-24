import { Module } from '@nestjs/common';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentInitiationController } from './payment-initiation.controller';
import { PaymentInitiationService } from './payment-initiation.service';

@Module({
  imports: [PaymentProviderModule],
  controllers: [PaymentInitiationController],
  providers: [PaymentInitiationService],
})
export class PaymentsModule {}