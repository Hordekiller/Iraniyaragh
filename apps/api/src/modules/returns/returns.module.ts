import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReturnsController, ReturnsPublicController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [AuditModule, AuthModule, InventoryModule, PaymentsModule],
  controllers: [ReturnsController, ReturnsPublicController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
