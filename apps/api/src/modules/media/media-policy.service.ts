import { Injectable } from '@nestjs/common';
import type { ProductMediaKind } from '@iranyaragh/contracts';

const MIB = 1024 * 1024;

@Injectable()
export class MediaPolicyService {
  readonly maxActiveAssets = 12;
  readonly maxActiveVideos = 3;
  readonly imageMaxBytes = 20 * MIB;
  readonly videoMaxBytes = 100 * MIB;
  readonly uploadTtlSeconds = 15 * 60;

  maxBytes(kind: ProductMediaKind): number {
    return kind === 'VIDEO' ? this.videoMaxBytes : this.imageMaxBytes;
  }
}
