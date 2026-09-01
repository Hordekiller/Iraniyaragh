import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}