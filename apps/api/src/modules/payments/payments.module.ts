import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentProviderModule } from './payment-provider.module';
import { PaymentInitiationController } from './payment-initiation.controller';
import { PaymentInitiationService } from './payment-initiation.service';
import { PaymentVerificationService } from './payment-verification.service';
import { ZarinpalCallbackController } from './zarinpal-callback.controller';
import { AdminPaymentReadController } from './admin-payment-read.controller';
import { AdminPaymentReadService } from './admin-payment-read.service';

@Module({
  imports: [PaymentProviderModule, AuditModule, InventoryModule],
  controllers: [PaymentInitiationController, ZarinpalCallbackController, AdminPaymentReadController],
  providers: [PaymentInitiationService, PaymentVerificationService, AdminPaymentReadService],
})
export class PaymentsModule {}
