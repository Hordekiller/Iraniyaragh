import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AdminProductMedia,
  ProductMediaConfirmResponse,
  ProductMediaUploadResponse,
} from '@iranyaragh/contracts';
import type { ProductMedia } from '@prisma/client';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from '../catalog/catalog-idempotency.service';
import type { ProductMediaConfirmDto, ProductMediaUploadDto } from './media.dto';
import { MediaPolicyService } from './media-policy.service';
import {
  PRODUCT_MEDIA_STORAGE,
  mediaSourceObjectKey,
  type ProductMediaStorage,
} from './storage.port';
import {
  PRODUCT_MEDIA_PROCESSING_QUEUE,
  type ProductMediaProcessingQueue,
} from './processing-queue.port';

function sanitizedFilename(value: string): string {
  const cleaned = [...value.trim()]
    .map(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      return character === '/' || character === '\\' || codePoint <= 31 || codePoint === 127
        ? '-'
        : character;
    })
    .slice(0, 255)
    .join('');
  return cleaned || 'upload';
}

function adminMedia(row: ProductMedia): AdminProductMedia {
  return {
    id: row.id,
    productId: row.productId,
    kind: row.kind,
    state: row.state,
    role: row.role,
    position: row.position,
    altText: row.altText,
    caption: row.caption,
    originalFilename: row.originalFilename,
    declaredMime: row.declaredMime,
    declaredBytes: row.declaredBytes.toString(),
    detectedMime: row.detectedMime,
    bytes: row.bytes?.toString() ?? null,
    width: row.width,
    height: row.height,
    durationMs: row.durationMs,
    hasAudio: row.hasAudio,
    posterMediaId: row.posterMediaId,
    checksumSha256: row.checksumSha256,
    failureCode: row.failureCode,
    version: row.version,
    uploadExpiresAt: row.uploadExpiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly idempotency: CatalogIdempotencyService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    @Inject(PRODUCT_MEDIA_PROCESSING_QUEUE) private readonly processingQueue: ProductMediaProcessingQueue,
    private readonly policy: MediaPolicyService,
  ) {}

  async initiateUpload(
    actorId: string,
    idempotencyKey: string,
    productId: string,
    input: ProductMediaUploadDto,
  ): Promise<ProductMediaUploadResponse> {
    this.assertKindMatchesMime(input.kind, input.declaredMime);
    this.assertRoleMatchesKind(input.kind, input.role);
    if (input.bytes > this.policy.maxBytes(input.kind)) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_TOO_LARGE',
        message: 'The media source exceeds the configured upload limit.',
      });
    }

    const safeInput = { ...input, originalFilename: sanitizedFilename(input.originalFilename) };
    const result = await this.idempotency.run<{ mediaId: string }>({
      actorId,
      scope: `media.upload:${productId}`,
      key: idempotencyKey,
      payload: safeInput,
      execute: async tx => {
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, version: true },
        });
        if (!product) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Product not found.' });
        if (product.version !== input.productVersion) {
          throw new ConflictException({
            code: 'STALE_VERSION',
            message: 'Product version conflict.',
            details: { expected: input.productVersion, actual: product.version },
          });
        }

        const [activeCount, videoCount] = await Promise.all([
          tx.productMedia.count({ where: { productId, state: { not: 'ARCHIVED' } } }),
          tx.productMedia.count({ where: { productId, kind: 'VIDEO', state: { not: 'ARCHIVED' } } }),
        ]);
        if (
          activeCount >= this.policy.maxActiveAssets ||
          (input.kind === 'VIDEO' && videoCount >= this.policy.maxActiveVideos)
        ) {
          throw new UnprocessableEntityException({
            code: 'MEDIA_LIMIT_EXCEEDED',
            message: 'The product media limit has been reached.',
          });
        }

        const mediaId = randomUUID();
        const objectKey = mediaSourceObjectKey({
          productId,
          mediaId,
          declaredMime: input.declaredMime,
        });
        const uploadExpiresAt = new Date(Date.now() + this.policy.uploadTtlSeconds * 1000);
        await tx.productMedia.create({
          data: {
            id: mediaId,
            productId,
            kind: input.kind,
            role: input.role,
            position: input.position,
            objectKey,
            originalFilename: safeInput.originalFilename,
            declaredMime: input.declaredMime,
            declaredBytes: BigInt(input.bytes),
            createdById: actorId,
            uploadExpiresAt,
          },
        });
        await this.audit.record(
          {
            action: 'catalog.media.upload.initiated',
            entityType: 'ProductMedia',
            entityId: mediaId,
            actorId,
            requestId: getRequestId(),
            metadata: {
              productId,
              kind: input.kind,
              role: input.role,
              position: input.position,
              declaredMime: input.declaredMime,
              declaredBytes: input.bytes,
            },
          },
          tx,
        );
        return { response: { mediaId }, resourceType: 'ProductMedia', resourceId: mediaId };
      },
    });

    const media = await this.prisma.productMedia.findUnique({ where: { id: result.mediaId } });
    if (!media) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media upload not found.' });
    if (media.state !== 'PENDING_UPLOAD' || media.uploadExpiresAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_UPLOAD_EXPIRED',
        message: 'The media upload intent has expired.',
      });
    }
    const signed = await this.storage.presignPut({
      objectKey: media.objectKey,
      contentType: media.declaredMime,
      bytes: input.bytes,
      expiresInSeconds: Math.max(1, Math.floor((media.uploadExpiresAt.getTime() - Date.now()) / 1000)),
    });
    return {
      data: {
        upload: {
          mediaId: media.id,
          objectKey: media.objectKey,
          uploadUrl: signed.url,
          method: 'PUT',
          requiredHeaders: signed.requiredHeaders,
          expiresAt: signed.expiresAt.toISOString(),
          version: media.version,
        },
      },
    };
  }

  async confirmUpload(
    actorId: string,
    idempotencyKey: string,
    productId: string,
    mediaId: string,
    input: ProductMediaConfirmDto,
  ): Promise<ProductMediaConfirmResponse> {
    const current = await this.prisma.productMedia.findFirst({ where: { id: mediaId, productId } });
    if (!current) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media upload not found.' });
    if (current.state === 'ARCHIVED' || current.state === 'FAILED') {
      throw new UnprocessableEntityException({
        code: 'MEDIA_NOT_READY',
        message: 'The media upload cannot be confirmed in its current state.',
      });
    }
    if (current.state === 'PENDING_UPLOAD' && current.uploadExpiresAt.getTime() <= Date.now()) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_UPLOAD_EXPIRED',
        message: 'The media upload intent has expired.',
      });
    }

    if (current.state === 'PENDING_UPLOAD') {
      const head = await this.storage.headObject(current.objectKey);
      if (!head) {
        throw new UnprocessableEntityException({
          code: 'MEDIA_NOT_READY',
          message: 'The uploaded object is not available for confirmation.',
        });
      }
      if (head.objectKey !== current.objectKey || head.bytes !== Number(current.declaredBytes)) {
        throw new UnprocessableEntityException({
          code: head.bytes > this.policy.maxBytes(current.kind) ? 'MEDIA_TOO_LARGE' : 'MEDIA_CHECKSUM_MISMATCH',
          message: 'Uploaded object metadata does not match the upload intent.',
        });
      }
      if (head.contentType !== current.declaredMime) {
        throw new UnprocessableEntityException({
          code: 'MEDIA_TYPE_UNSUPPORTED',
          message: 'Uploaded object content type does not match the upload intent.',
        });
      }
      if (
        input.checksumSha256 &&
        head.checksumSha256 &&
        input.checksumSha256 !== head.checksumSha256
      ) {
        throw new UnprocessableEntityException({
          code: 'MEDIA_CHECKSUM_MISMATCH',
          message: 'Uploaded object checksum does not match.',
        });
      }
    }

    const result = await this.idempotency.run<{ mediaId: string }>({
      actorId,
      scope: `media.confirm:${mediaId}`,
      key: idempotencyKey,
      payload: { productId, mediaId, checksumSha256: input.checksumSha256 ?? null },
      execute: async tx => {
        const row = await tx.productMedia.findFirst({ where: { id: mediaId, productId } });
        if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media upload not found.' });
        if (row.state === 'PENDING_UPLOAD') {
          const updated = await tx.productMedia.updateMany({
            where: { id: mediaId, productId, state: 'PENDING_UPLOAD', version: row.version },
            data: { state: 'UPLOADED', version: { increment: 1 } },
          });
          if (updated.count !== 1) {
            throw new ConflictException({ code: 'STALE_VERSION', message: 'Media version conflict.' });
          }
          await this.audit.record(
            {
              action: 'catalog.media.upload.confirmed',
              entityType: 'ProductMedia',
              entityId: mediaId,
              actorId,
              requestId: getRequestId(),
              before: { state: 'PENDING_UPLOAD', version: row.version },
              after: { state: 'UPLOADED', version: row.version + 1 },
              metadata: { productId },
            },
            tx,
          );
        } else if (row.state !== 'UPLOADED' && row.state !== 'PROCESSING' && row.state !== 'READY') {
          throw new UnprocessableEntityException({
            code: 'MEDIA_NOT_READY',
            message: 'The media upload cannot be confirmed in its current state.',
          });
        }
        return { response: { mediaId }, resourceType: 'ProductMedia', resourceId: mediaId };
      },
    });

    const confirmed = await this.prisma.productMedia.findUnique({ where: { id: result.mediaId } });
    if (!confirmed) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Media upload not found.' });
    if (confirmed.state === 'UPLOADED' || confirmed.state === 'PROCESSING') {
      await this.processingQueue.enqueue({ mediaId: confirmed.id, objectKey: confirmed.objectKey });
    }
    return { data: { media: adminMedia(confirmed) } };
  }

  private assertKindMatchesMime(kind: ProductMediaUploadDto['kind'], mime: string): void {
    if ((kind === 'VIDEO') !== (mime === 'video/mp4')) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_TYPE_UNSUPPORTED',
        message: 'Media kind and declared MIME type do not match.',
      });
    }
  }

  private assertRoleMatchesKind(
    kind: ProductMediaUploadDto['kind'],
    role: ProductMediaUploadDto['role'],
  ): void {
    if (kind === 'VIDEO' && role !== 'GALLERY') {
      throw new UnprocessableEntityException({
        code: 'MEDIA_TYPE_UNSUPPORTED',
        message: 'Video media must use the gallery role.',
      });
    }
  }
}
