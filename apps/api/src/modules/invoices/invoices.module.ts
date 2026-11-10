import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvoicePolicyController } from './invoice-policy.controller';
import { InvoicePolicyService } from './invoice-policy.service';
import { OrdersModule } from '../orders/orders.module';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDraftController } from './invoice-draft.controller';
import { InvoiceDocumentController } from './invoice-document.controller';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePublicationController, CustomerInvoiceController } from './invoice-publication.controller';
import { InvoicePublicationService } from './invoice-publication.service';
import { InvoicePdfArtifactStore } from './invoice-pdf-artifact.store';
import { BullMqInvoicePdfQueue } from './bullmq-invoice-pdf-queue.adapter';
import { InvoicePdfJobService } from './invoice-pdf-job.service';
import { INVOICE_PDF_QUEUE } from './invoice-pdf-queue.port';
import { AuthModule } from '../auth/auth.module';
import { InvoiceAutomationController } from './invoice-automation.controller';
import { InvoiceAutomationService } from './invoice-automation.service';
import { InvoicePdfCapacityController } from './invoice-pdf-capacity.controller';
import { InvoicePdfCapacityService } from './invoice-pdf-capacity.service';
@Module({
  imports: [AuditModule, AuthModule, OrdersModule],
  controllers: [InvoicePolicyController, InvoiceDraftController, InvoiceDocumentController, InvoicePublicationController, CustomerInvoiceController, InvoiceAutomationController, InvoicePdfCapacityController],
  providers: [
    InvoicePolicyService,
    InvoiceDraftService,
    InvoiceDocumentService,
    InvoicePublicationService,
    InvoicePdfArtifactStore,
    BullMqInvoicePdfQueue,
    { provide: INVOICE_PDF_QUEUE, useExisting: BullMqInvoicePdfQueue },
    InvoicePdfJobService,
    InvoiceAutomationService,
    InvoicePdfCapacityService,
  ],
  exports: [InvoicePolicyService, InvoiceDraftService, InvoiceAutomationService],
})
export class InvoicesModule {}
