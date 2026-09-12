import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogImportService } from './catalog-import.service';

@Module({ imports: [AuditModule], controllers: [CatalogController], providers: [CatalogService, CatalogIdempotencyService, CatalogImportService], exports: [CatalogService, CatalogImportService] })
export class CatalogModule {}
