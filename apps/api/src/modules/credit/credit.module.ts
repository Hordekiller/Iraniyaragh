import { CreditSaleController } from './credit-sale.controller';
import { CreditSaleService } from './credit-sale.service';
import { InventoryModule } from '../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CreditController, CustomerCreditController } from './credit.controller';
import { CreditService } from './credit.service';
@Module({ imports: [AuditModule, InventoryModule], controllers: [CreditSaleController, CreditController, CustomerCreditController], providers: [CreditService, CreditSaleService], exports: [CreditService] })
export class CreditModule {}
