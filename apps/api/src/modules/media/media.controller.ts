import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type {
  AdminProductMediaListResponse,
  AdminProductMediaResponse,
  ProductMediaConfirmResponse,
  ProductMediaUploadResponse,
} from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import {
  ProductMediaArchiveDto,
  ProductMediaConfirmDto,
  ProductMediaMetadataDto,
  ProductMediaReorderDto,
  ProductMediaUploadDto,
} from './media.dto';
import { MediaService } from './media.service';

const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  description: 'Stable 8-96 character key retained across ambiguous retries.',
} as const;

@Controller({ path: 'catalog/admin/products/:productId/media', version: '1' })
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.read')
  list(@Param('productId') productId: string): Promise<AdminProductMediaListResponse> {
    return this.media.listAdmin(productId);
  }

  @Post('uploads')
  @ApiHeader(idempotencyHeader)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.write')
  initiateUpload(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('productId') productId: string,
    @Body() input: ProductMediaUploadDto,
  ): Promise<ProductMediaUploadResponse> {
    return this.media.initiateUpload(principal.userId, idempotencyKey, productId, input);
  }

  @Post(':mediaId/confirm')
  @ApiHeader(idempotencyHeader)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.write')
  confirmUpload(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
    @Body() input: ProductMediaConfirmDto,
  ): Promise<ProductMediaConfirmResponse> {
    return this.media.confirmUpload(principal.userId, idempotencyKey, productId, mediaId, input);
  }

  @Patch(':mediaId')
  @ApiHeader(idempotencyHeader)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.write')
  updateMetadata(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
    @Body() input: ProductMediaMetadataDto,
  ): Promise<AdminProductMediaResponse> {
    return this.media.updateMetadata(principal.userId, idempotencyKey, productId, mediaId, input);
  }

  @Post('reorder')
  @ApiHeader(idempotencyHeader)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.write')
  reorder(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('productId') productId: string,
    @Body() input: ProductMediaReorderDto,
  ): Promise<AdminProductMediaListResponse> {
    return this.media.reorder(principal.userId, idempotencyKey, productId, input);
  }

  @Post(':mediaId/archive')
  @ApiHeader(idempotencyHeader)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.media.write')
  archive(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') idempotencyKey: string,
    @Param('productId') productId: string,
    @Param('mediaId') mediaId: string,
    @Body() input: ProductMediaArchiveDto,
  ): Promise<AdminProductMediaResponse> {
    return this.media.archive(principal.userId, idempotencyKey, productId, mediaId, input);
  }
}
