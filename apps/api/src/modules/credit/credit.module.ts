import { CreditReturnController, CustomerCreditReturnController } from './credit-return.controller';
import { CreditReturnService } from './credit-return.service';
import { CreditSaleController } from './credit-sale.controller';
import { CreditSaleService } from './credit-sale.service';
import { InventoryModule } from '../inventory/inventory.module';
import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CreditController, CustomerCreditController } from './credit.controller';
import { CreditService } from './credit.service';
@Module({ imports: [AuditModule, InventoryModule], controllers: [CreditReturnController, CustomerCreditReturnController, CreditSaleController, CreditController, CustomerCreditController], providers: [CreditService, CreditSaleService, CreditReturnService], exports: [CreditService] })
export class CreditModule {}
