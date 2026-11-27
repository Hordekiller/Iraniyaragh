import { Body, ConflictException, Controller, Get, Headers, Inject, NotFoundException, Param, Post, Query, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiHeader, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsString, IsOptional, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { AuditLogService } from '../audit/audit-log.service';
import { CatalogIdempotencyService } from '../catalog/catalog-idempotency.service';
import { getRequestId } from '../../common/request-context';
import { MediaService } from './media.service';
import { MediaPolicyService } from './media-policy.service';
import { ProductMediaArchiveDto, ProductMediaConfirmDto } from './media.dto';
import { mediaSourceObjectKey, PRODUCT_MEDIA_STORAGE, type ProductMediaStorage } from './storage.port';
import { widestRenditionProjection } from './media-url';

export class AssetListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) page = 1;
  @IsOptional() @IsString() @MaxLength(128) selectedId?: string;
}

export class StorefrontAssetUploadDto {
  @ApiProperty() @IsString() @MaxLength(255) originalFilename!: string;
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] }) @IsIn(['image/jpeg', 'image/png', 'image/webp']) declaredMime!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(20 * 1024 * 1024) bytes!: number;
  @ApiProperty() @IsString() @MaxLength(200) altText!: string;
}

/** Independent assets share product media's quarantine, scanner, worker and rendition lifecycle. */
@Controller({ path: 'catalog/admin/storefront-assets', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('catalog.media.write')
export class StorefrontAssetsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogIdempotencyService) private readonly idempotency: CatalogIdempotencyService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
    @Inject(MediaService) private readonly media: MediaService,
    @Inject(MediaPolicyService) private readonly policy: MediaPolicyService,
    @Inject(PRODUCT_MEDIA_STORAGE) private readonly storage: ProductMediaStorage,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  @Get()
  @RequirePermission('catalog.media.read')
  async list(@Query() query: AssetListDto) {
    const rows = await this.prisma.productMedia.findMany({ where: { assetScope: 'STOREFRONT', state: { not: 'ARCHIVED' } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 100, skip: (query.page - 1) * 100, include: { renditions: true } });
    if (query.selectedId && !rows.some(row => row.id === query.selectedId)) {
      const selected = await this.prisma.productMedia.findFirst({ where: { id: query.selectedId, assetScope: 'STOREFRONT', state: { not: 'ARCHIVED' } }, include: { renditions: true } });
      if (selected) rows.push(selected);
    }
    return { data: { items: rows.map(row => ({ id: row.id, state: row.state, version: row.version, altText: row.altText, failureCode: row.failureCode, image: row.state === 'READY' ? widestRenditionProjection(this.config.get<string>('PUBLIC_MEDIA_ORIGIN') ?? 'http://localhost:9000/products', row.renditions) : null })) } };
  }

  @Post('uploads')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async upload(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body() input: StorefrontAssetUploadDto) {
    if (input.bytes > this.policy.imageMaxBytes || !input.altText.trim()) throw new UnprocessableEntityException({ code: 'VALIDATION_ERROR', message: 'Image size or alternative text is invalid.' });
    const result = await this.idempotency.run({ actorId: principal.userId, scope: 'storefront.asset.upload', key, payload: input, execute: async tx => {
      const id = randomUUID();
      const row = await tx.productMedia.create({ data: { id, productId: null, assetScope: 'STOREFRONT', kind: 'IMAGE', role: 'GALLERY', position: 0, altText: input.altText.trim(), objectKey: mediaSourceObjectKey({ productId: null, mediaId: id, declaredMime: input.declaredMime }), originalFilename: [...input.originalFilename].map(char => char.charCodeAt(0) < 32 || char === '/' || char === String.fromCharCode(92) ? '-' : char).join(''), declaredMime: input.declaredMime, declaredBytes: BigInt(input.bytes), createdById: principal.userId, uploadExpiresAt: new Date(Date.now() + this.policy.uploadTtlSeconds * 1000) } });
      await this.audit.record({ actorId: principal.userId, action: 'storefront.asset.upload.initiated', entityType: 'ProductMedia', entityId: id, requestId: getRequestId(), metadata: { declaredBytes: input.bytes, declaredMime: input.declaredMime } }, tx);
      return { response: { id: row.id }, resourceId: id, resourceType: 'ProductMedia' };
    } });
    const row = await this.prisma.productMedia.findUniqueOrThrow({ where: { id: result.id } });
    if (row.state !== 'PENDING_UPLOAD' || row.uploadExpiresAt.getTime() <= Date.now()) throw new ConflictException({ code: 'MEDIA_UPLOAD_EXPIRED', message: 'Upload intent expired.' });
    const signed = await this.storage.presignPut({ objectKey: row.objectKey, contentType: row.declaredMime, bytes: Number(row.declaredBytes), expiresInSeconds: Math.max(1, Math.floor((row.uploadExpiresAt.getTime() - Date.now()) / 1000)) });
    return { data: { upload: { mediaId: row.id, uploadUrl: signed.url, method: 'PUT' as const, requiredHeaders: signed.requiredHeaders, expiresAt: signed.expiresAt.toISOString(), version: row.version } } };
  }

  @Post(':id/confirm')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  confirm(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Param('id') id: string, @Body() input: ProductMediaConfirmDto) {
    return this.media.confirmUpload(principal.userId, key, null, id, input);
  }

  @Post(':id/archive')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  archive(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Param('id') id: string, @Body() input: ProductMediaArchiveDto) {
    return this.idempotency.run({ actorId: principal.userId, scope: `storefront.asset.archive:${id}`, key, payload: input, execute: async tx => {
      // The same lock is held when attaching images or replacing the shop configuration.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892600)`;
      const row = await tx.productMedia.findFirst({ where: { id, assetScope: 'STOREFRONT' }, include: { _count: { select: { categoryImages: true, brandImages: true, shopReferences: true, blogPostCovers: true, doorModels: true } } } });
      if (!row) throw new NotFoundException();
      if (Object.values(row._count).some(count => count > 0)) throw new ConflictException({ code: 'MEDIA_IN_USE', message: 'Remove all references before archiving this image.' });
      if (row.state !== 'ARCHIVED') {
        if (row.version !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Reload this asset before archiving.' });
        await tx.productMedia.update({ where: { id }, data: { state: 'ARCHIVED', archivedAt: new Date(), sourceDeleteAt: new Date(), version: { increment: 1 } } });
        await this.audit.record({ actorId: principal.userId, action: 'storefront.asset.archived', entityType: 'ProductMedia', entityId: id, requestId: getRequestId() }, tx);
      }
      return { response: { data: { archived: true } }, resourceId: id, resourceType: 'ProductMedia' };
    } });
  }
}
