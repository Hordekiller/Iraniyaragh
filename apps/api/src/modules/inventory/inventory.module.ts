import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { PublicInventoryController } from './public-inventory.controller';

@Module({
  imports: [AuditModule],
  providers: [InventoryService],
  controllers: [InventoryController, PublicInventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
