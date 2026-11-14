import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { CatalogIdempotencyService } from './catalog-idempotency.service';
import { CatalogImportService } from './catalog-import.service';
import { HomepageCollectionsController } from './homepage-collections.controller';
import { HomepageCollectionsService } from './homepage-collections.service';
import { HomepageBannersController } from './homepage-banners.controller';
import { HomepageBannersService } from './homepage-banners.service';
import { StorefrontHelperController } from './storefront-helper.controller';
import { StorefrontHelperService } from './storefront-helper.service';
import { StorefrontContactsController } from './storefront-contacts.controller';
import { StorefrontContactsService } from './storefront-contacts.service';
import { HomepageHeroController } from './homepage-hero.controller';
import { HomepageHeroService } from './homepage-hero.service';

@Module({ imports: [AuditModule], controllers: [CatalogController, HomepageCollectionsController, HomepageBannersController, HomepageHeroController, StorefrontHelperController, StorefrontContactsController], providers: [CatalogService, CatalogIdempotencyService, CatalogImportService, HomepageCollectionsService, HomepageBannersService, HomepageHeroService, StorefrontHelperService, StorefrontContactsService], exports: [CatalogService, CatalogImportService, CatalogIdempotencyService] })
export class CatalogModule {}
