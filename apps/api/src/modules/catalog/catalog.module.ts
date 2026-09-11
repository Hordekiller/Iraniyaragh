import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';

@Module({ imports: [AuditModule], controllers: [CatalogController], providers: [CatalogService, CatalogIdempotencyService], exports: [CatalogService] })
export class CatalogModule {}
