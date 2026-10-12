import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CreditController, CustomerCreditController } from './credit.controller';
import { CreditService } from './credit.service';
@Module({ imports: [AuditModule], controllers: [CreditController, CustomerCreditController], providers: [CreditService], exports: [CreditService] })
export class CreditModule {}
