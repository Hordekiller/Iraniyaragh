import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ProductMediaUploadResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from '../catalog/catalog-idempotency.service';
import type { ProductMediaUploadDto } from './media.dto';
import { MediaPolicyService } from './media-policy.service';
import {
  PRODUCT_MEDIA_STORAGE,
  mediaSourceObjectKey,
  type ProductMediaStorage,
} from './storage.port';

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

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly idempotency: CatalogIdempotencyService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
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
