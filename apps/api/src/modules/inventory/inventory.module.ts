import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PublicInventoryController } from './public-inventory.controller';
import { InventoryCostPolicyService } from './inventory-cost-policy.service';
import { InventoryCostPolicyController } from './inventory-cost-policy.controller';

@Module({
  imports: [AuditModule],
  providers: [InventoryService, InventoryCostPolicyService],
  controllers: [InventoryController, PublicInventoryController, InventoryCostPolicyController],
  exports: [InventoryService],
})
export class InventoryModule {}
