import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvoicePolicyController } from './invoice-policy.controller';
import { InvoicePolicyService } from './invoice-policy.service';
@Module({ imports: [AuditModule], controllers: [InvoicePolicyController], providers: [InvoicePolicyService], exports: [InvoicePolicyService] })
export class InvoicesModule {}
