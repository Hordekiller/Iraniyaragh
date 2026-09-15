import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ProductMediaKind } from '@iranyaragh/contracts';
import type { EnvironmentVariables } from '../../config/environment';

const MIB = 1024 * 1024;

@Injectable()
export class MediaPolicyService {
  readonly maxActiveAssets: number;
  readonly maxActiveVideos: number;
  readonly imageMaxBytes: number;
  readonly maxImagePixels: number;
  readonly videoMaxBytes = 100 * MIB;
  readonly uploadTtlSeconds: number;

  constructor(@Optional() @Inject(ConfigService) config?: ConfigService<EnvironmentVariables, true>) {
    this.maxActiveAssets = config?.get('PRODUCT_MEDIA_MAX_ASSETS', { infer: true }) ?? 12;
    this.maxActiveVideos = config?.get('PRODUCT_MEDIA_MAX_VIDEOS', { infer: true }) ?? 3;
    this.imageMaxBytes = config?.get('PRODUCT_MEDIA_IMAGE_MAX_BYTES', { infer: true }) ?? 20 * MIB;
    this.maxImagePixels = config?.get('PRODUCT_MEDIA_MAX_IMAGE_PIXELS', { infer: true }) ?? 40_000_000;
    this.uploadTtlSeconds = config?.get('PRODUCT_MEDIA_UPLOAD_TTL_SECONDS', { infer: true }) ?? 15 * 60;
  }

  maxBytes(kind: ProductMediaKind): number {
    return kind === 'VIDEO' ? this.videoMaxBytes : this.imageMaxBytes;
  }
}
