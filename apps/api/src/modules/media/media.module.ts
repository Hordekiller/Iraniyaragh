import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../../config/environment';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { BullMqProductMediaProcessingQueue } from './bullmq-processing-queue.adapter';
import { MediaController } from './media.controller';
import { ProductMediaImageProcessor } from './image-processor.service';
import { EnvironmentMediaMalwareScanner, PRODUCT_MEDIA_MALWARE_SCANNER } from './malware-scanner.port';
import { MediaPolicyService } from './media-policy.service';
import { MediaService } from './media.service';
import { PRODUCT_MEDIA_PROCESSING_QUEUE } from './processing-queue.port';
import { S3ProductMediaStorage } from './s3-storage.adapter';
import { PRODUCT_MEDIA_STORAGE } from './storage.port';

@Module({
  imports: [AuditModule, CatalogModule],
  controllers: [MediaController],
  providers: [
    MediaPolicyService,
    MediaService,
    ProductMediaImageProcessor,
    EnvironmentMediaMalwareScanner,
    { provide: PRODUCT_MEDIA_MALWARE_SCANNER, useExisting: EnvironmentMediaMalwareScanner },
    BullMqProductMediaProcessingQueue,
    {
      provide: PRODUCT_MEDIA_PROCESSING_QUEUE,
      useExisting: BullMqProductMediaProcessingQueue,
    },
    {
      provide: PRODUCT_MEDIA_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => new S3ProductMediaStorage(config),
    },
  ],
  exports: [MediaService, ProductMediaImageProcessor, PRODUCT_MEDIA_PROCESSING_QUEUE, PRODUCT_MEDIA_STORAGE],
})
export class MediaModule {}
