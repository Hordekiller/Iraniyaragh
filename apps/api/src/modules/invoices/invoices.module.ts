import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvoicePolicyController } from './invoice-policy.controller';
import { InvoicePolicyService } from './invoice-policy.service';
import { OrdersModule } from '../orders/orders.module';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDraftController } from './invoice-draft.controller';
import { InvoiceDocumentController } from './invoice-document.controller';
import { InvoiceDocumentService } from './invoice-document.service';
@Module({ imports: [AuditModule, OrdersModule], controllers: [InvoicePolicyController, InvoiceDraftController, InvoiceDocumentController], providers: [InvoicePolicyService, InvoiceDraftService, InvoiceDocumentService], exports: [InvoicePolicyService] })
export class InvoicesModule {}
