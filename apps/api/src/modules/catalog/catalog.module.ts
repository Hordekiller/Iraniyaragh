import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogImportService } from './catalog-import.service';
import { HomepageCollectionsController } from './homepage-collections.controller';
import { HomepageCollectionsService } from './homepage-collections.service';

@Module({ imports: [AuditModule], controllers: [CatalogController, HomepageCollectionsController], providers: [CatalogService, CatalogIdempotencyService, CatalogImportService, HomepageCollectionsService], exports: [CatalogService, CatalogImportService, CatalogIdempotencyService] })
export class CatalogModule {}
