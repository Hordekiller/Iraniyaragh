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
@Module({
  imports: [AuditModule, OrdersModule],
  controllers: [InvoicePolicyController, InvoiceDraftController, InvoiceDocumentController, InvoicePublicationController, CustomerInvoiceController],
  providers: [
    InvoicePolicyService,
    InvoiceDraftService,
    InvoiceDocumentService,
    InvoicePublicationService,
    InvoicePdfArtifactStore,
    BullMqInvoicePdfQueue,
    { provide: INVOICE_PDF_QUEUE, useExisting: BullMqInvoicePdfQueue },
    InvoicePdfJobService,
  ],
  exports: [InvoicePolicyService],
})
export class InvoicesModule {}
