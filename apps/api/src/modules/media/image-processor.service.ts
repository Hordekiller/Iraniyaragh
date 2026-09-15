import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';
import {
  PRODUCT_MEDIA_MALWARE_SCANNER,
  type ProductMediaMalwareScanner,
} from './malware-scanner.port';
import { MediaPolicyService } from './media-policy.service';
import {
  PRODUCT_MEDIA_STORAGE,
  mediaRenditionObjectKey,
  type ProductMediaStorage,
} from './storage.port';

const PURPOSES = [
  ['THUMBNAIL', 160],
  ['CARD', 480],
  ['DETAIL_SM', 768],
  ['DETAIL_MD', 1200],
  ['DETAIL_LG', 1600],
] as const;

const MIME_BY_FILE_TYPE = new Map([
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

async function boundedBuffer(stream: NodeJS.ReadableStream, maximumBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > maximumBytes) throw new Error('MEDIA_TOO_LARGE');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class ProductMediaImageProcessor {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    @Inject(PRODUCT_MEDIA_MALWARE_SCANNER) private readonly scanner: ProductMediaMalwareScanner,
    @Inject(MediaPolicyService) private readonly policy: MediaPolicyService,
  ) {}

  async process(mediaId: string, options: { finalAttempt?: boolean } = {}): Promise<void> {
    const media = await this.prisma.productMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.state === 'ARCHIVED' || media.state === 'READY') return;
    if (media.kind !== 'IMAGE') return;
    if (media.state !== 'UPLOADED' && media.state !== 'PROCESSING') return;

    if (media.state === 'UPLOADED') {
      const claimed = await this.prisma.productMedia.updateMany({
        where: { id: media.id, state: 'UPLOADED', version: media.version },
        data: { state: 'PROCESSING', version: { increment: 1 }, failureCode: null },
      });
      if (claimed.count !== 1) return;
    }

    try {
      const source = await boundedBuffer(await this.storage.getObject(media.objectKey), this.policy.imageMaxBytes);
      const detected = await fileTypeFromBuffer(source);
      const detectedMime = detected ? MIME_BY_FILE_TYPE.get(detected.ext) : undefined;
      if (!detectedMime || detectedMime !== media.declaredMime) throw new Error('MEDIA_TYPE_UNSUPPORTED');

      const scan = await this.scanner.scan(source);
      if (scan !== 'CLEAN') throw new Error(scan === 'INFECTED' ? 'MEDIA_MALWARE_DETECTED' : 'MEDIA_SCANNER_UNAVAILABLE');

      const image = sharp(source, { failOn: 'warning', limitInputPixels: this.policy.maxImagePixels }).rotate();
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) throw new Error('MEDIA_DECODE_FAILED');

      const version = media.version + (media.state === 'UPLOADED' ? 2 : 1);
      const rows: Array<{
        id: string; mediaId: string; purpose: (typeof PURPOSES)[number][0]; format: string;
        objectKey: string; bytes: bigint; width: number; height: number; checksumSha256: string;
      }> = [];
      for (const [purpose, width] of PURPOSES) {
        for (const format of ['webp', 'jpeg'] as const) {
          const output = await image.clone().resize({ width, withoutEnlargement: true }).toFormat(format, { quality: 82 }).toBuffer({ resolveWithObject: true });
          const checksumSha256 = createHash('sha256').update(output.data).digest('hex');
          const objectKey = mediaRenditionObjectKey({ productId: media.productId, mediaId, mediaVersion: version, purpose, format });
          await this.storage.putObject({ objectKey, body: output.data, contentType: `image/${format}`, checksumSha256 });
          rows.push({ id: randomUUID(), mediaId, purpose, format, objectKey, bytes: BigInt(output.data.byteLength), width: output.info.width, height: output.info.height, checksumSha256 });
        }
      }

      await this.prisma.$transaction(async tx => {
        await tx.productMediaRendition.deleteMany({ where: { mediaId } });
        await tx.productMediaRendition.createMany({ data: rows });
        const completed = await tx.productMedia.updateMany({
          where: { id: mediaId, state: 'PROCESSING' },
          data: {
            state: 'READY', detectedMime, bytes: BigInt(source.byteLength), width: metadata.width,
            height: metadata.height, checksumSha256: createHash('sha256').update(source).digest('hex'),
            sourceDeleteAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), version: { increment: 1 },
          },
        });
        if (completed.count !== 1) throw new Error('MEDIA_STATE_CONFLICT');
      });
    } catch (error) {
      const code = error instanceof Error && /^MEDIA_[A-Z_]+$/u.test(error.message) ? error.message : 'MEDIA_PROCESSING_FAILED';
      const finalAttempt = options.finalAttempt ?? true;
      await this.prisma.productMedia.updateMany({
        where: { id: mediaId, state: 'PROCESSING' },
        data: finalAttempt
          ? { state: 'FAILED', failureCode: code, sourceDeleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000), version: { increment: 1 } }
          : { failureCode: code },
      });
      throw new Error(code);
    }
  }
}
