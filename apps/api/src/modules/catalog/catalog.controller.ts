import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UnprocessableEntityException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiHeader, ApiOkResponse, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { AttributeDefinitionResponse, AttributeListResponse, AttributeOptionResponse, BrandListResponse, BrandResponse, CatalogImportCommitResponse, CatalogImportDetailResponse, CatalogImportDryRunResponse, CatalogImportUploadResponse, CategoryListResponse, CategoryResponse, CategoryTreeResponse, ProductDetailPublicResponse, ProductDetailResponse, ProductListResponse, ProductStatusResponse, ProductVariantResponse, VariantGeneratePreviewResponse, VariantGenerateResponse, VariantPriceHistoryResponse, VariantPriceResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CatalogService } from './catalog.service';
import { AttributeDefinitionCreateDto, AttributeDefinitionUpdateDto, AttributeOptionCreateDto, AttributeOptionUpdateDto, BrandCreateDto, BrandUpdateDto, CategoryCreateDto, CategoryUpdateDto, ProductAttributeConfigurationUpdateDto, ProductCreateDto, ProductDescriptionDto, ProductListQueryDto, ProductStatusDto, ProductVariantStatusDto, ProductVariantUpdateDto, VariantGenerateDto, VariantGeneratePreviewDto, VariantPriceUpdateDto } from './catalog.dto';
import { PublicCatalogCache } from './public-catalog-cache.interceptor';
import { CatalogImportService } from './catalog-import.service';
import { openApiCatalogFailures, openApiPublicCatalog } from './catalog.openapi';

const catalogFailure = openApiCatalogFailures;

type UploadedCatalogFile = { buffer: Buffer };

@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService, private readonly imports: CatalogImportService) {}

  @Get('products')
  @PublicCatalogCache()
  @ApiOkResponse({ schema: openApiPublicCatalog.products })
  async publicProducts(@Query() query: ProductListQueryDto): Promise<ProductListResponse> { return this.catalog.listPublicProducts(query); }

  @Get('products/:idOrSlug')
  @PublicCatalogCache()
  @ApiOkResponse({ schema: openApiPublicCatalog.product })
  async publicProduct(@Param('idOrSlug') idOrSlug: string): Promise<ProductDetailPublicResponse> { return this.catalog.getPublicProduct(idOrSlug); }

  @Get('categories')
  @PublicCatalogCache()
  async categories(): Promise<CategoryListResponse> { return this.catalog.listCategories(); }

  @Get('categories/tree')
  @PublicCatalogCache()
  async categoryTree(): Promise<CategoryTreeResponse> { return this.catalog.categoryTree(); }

  @Get('brands')
  @PublicCatalogCache()
  async brands(): Promise<BrandListResponse> { return this.catalog.listBrands(); }

  @Get('admin/products')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async adminProducts(@Query() query: ProductListQueryDto): Promise<ProductListResponse> { return this.catalog.listAdminProducts(query); }

  @Get('admin/products/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async adminProduct(@Param('id') id: string): Promise<ProductDetailResponse> { return this.catalog.getAdminProduct(id); }

  @Post('admin/products')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async createProduct(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Body() input: ProductCreateDto): Promise<ProductDetailResponse> { return this.catalog.createProduct(principal.userId, idempotencyKey, input); }

  @Patch('admin/products/:id/attributes')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async configureProductAttributes(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: ProductAttributeConfigurationUpdateDto): Promise<ProductDetailResponse> { return this.catalog.configureProductAttributes(principal.userId, id, input); }

  @Post('admin/products/:id/variants/preview')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async previewVariants(@Param('id') id: string, @Body() input: VariantGeneratePreviewDto): Promise<VariantGeneratePreviewResponse> { return this.catalog.previewVariantGeneration(id, input); }

  @Post('admin/products/:id/variants/generate')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async generateVariants(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Param('id') id: string, @Body() input: VariantGenerateDto): Promise<VariantGenerateResponse> { return this.catalog.generateVariants(principal.userId, idempotencyKey, id, input); }

  @Patch('admin/products/:id/description')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: catalogFailure.descriptionNotFound, description: catalogFailure.descriptionNotFound.description })
  @ApiResponse({ status: 409, schema: catalogFailure.descriptionConflict, description: catalogFailure.descriptionConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.descriptionInvalid, description: catalogFailure.descriptionInvalid.description })
  async description(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Param('id') id: string, @Body() input: ProductDescriptionDto): Promise<ProductDetailResponse> { return this.catalog.updateProductDescription(principal.userId, idempotencyKey, id, input); }

  @Post('admin/products/:id/status')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async status(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Param('id') id: string, @Body() input: ProductStatusDto): Promise<ProductStatusResponse> { return this.catalog.changeProductStatus(principal.userId, idempotencyKey, id, input); }

  @Get('admin/attributes')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async attributes(): Promise<AttributeListResponse> { return this.catalog.listAttributes(); }

  @Get('admin/attributes/:id')
  @ApiParam({ name: 'id', description: 'Attribute definition identifier', required: true, type: String })
  @ApiOkResponse({
    description: 'Catalog attribute definition with its options.',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'object',
          properties: { attribute: { type: 'object', additionalProperties: true } },
          required: ['attribute'],
        },
      },
      required: ['data'],
    },
  })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async getAttribute(@Param('id') id: string): Promise<AttributeDefinitionResponse> { return this.catalog.getAttribute(id); }

  @Post('admin/attributes')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async createAttribute(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Body() input: AttributeDefinitionCreateDto): Promise<AttributeDefinitionResponse> { return this.catalog.createAttribute(principal.userId, idempotencyKey, input); }

  @Patch('admin/attributes/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateAttribute(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: AttributeDefinitionUpdateDto): Promise<AttributeDefinitionResponse> { return this.catalog.updateAttribute(principal.userId, id, input); }

  @Post('admin/attributes/:id/options')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async createAttributeOption(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Param('id') id: string, @Body() input: AttributeOptionCreateDto): Promise<AttributeOptionResponse> { return this.catalog.createAttributeOption(principal.userId, idempotencyKey, id, input); }

  @Patch('admin/attributes/:attributeId/options/:optionId')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateAttributeOption(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('attributeId') attributeId: string, @Param('optionId') optionId: string, @Body() input: AttributeOptionUpdateDto): Promise<AttributeOptionResponse> { return this.catalog.updateAttributeOption(principal.userId, attributeId, optionId, input); }

  @Patch('admin/variants/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateVariant(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: ProductVariantUpdateDto): Promise<ProductVariantResponse> { return this.catalog.updateVariant(principal.userId, id, input); }

  @Post('admin/variants/:id/status')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  async updateVariantStatus(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Param('id') id: string, @Body() input: ProductVariantStatusDto): Promise<ProductVariantResponse> { return this.catalog.updateVariantStatus(principal.userId, idempotencyKey, id, input); }

  @Patch('admin/variants/:id/price')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateVariantPrice(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: VariantPriceUpdateDto): Promise<VariantPriceResponse> { return this.catalog.updateVariantPrice(principal.userId, id, input); }

  @Get('admin/variants/:id/price-history')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async variantPriceHistory(@Param('id') id: string): Promise<VariantPriceHistoryResponse> { return this.catalog.variantPriceHistory(id); }

  @Post('admin/brands')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  async createBrand(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Body() input: BrandCreateDto): Promise<BrandResponse> { return this.catalog.createBrand(principal.userId, idempotencyKey, input); }

  @Patch('admin/brands/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateBrand(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: BrandUpdateDto): Promise<BrandResponse> { return this.catalog.updateBrand(principal.userId, id, input); }

  @Post('admin/categories')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Stable 8-96 character key retained across ambiguous retries.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 422, schema: catalogFailure.invalidReference, description: catalogFailure.invalidReference.description })
  async createCategory(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string, @Body() input: CategoryCreateDto): Promise<CategoryResponse> { return this.catalog.createCategory(principal.userId, idempotencyKey, input); }

  @Patch('admin/categories/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateCategory(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: CategoryUpdateDto): Promise<CategoryResponse> { return this.catalog.updateCategory(principal.userId, id, input); }

  @Post('admin/imports')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'x-iranyaragh-catalog-version', required: true })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 400, schema: catalogFailure.validation, description: catalogFailure.validation.description })
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: catalogFailure.idempotencyConflict, description: catalogFailure.idempotencyConflict.description })
  @ApiResponse({ status: 413, schema: catalogFailure.payloadTooLarge, description: catalogFailure.payloadTooLarge.description })
  @ApiResponse({ status: 422, schema: catalogFailure.importValidation, description: catalogFailure.importValidation.description })
  async uploadImport(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Headers('x-iranyaragh-catalog-version') version: string, @UploadedFile() file: UploadedCatalogFile): Promise<CatalogImportUploadResponse> {
    if (!file?.buffer) throw new UnprocessableEntityException({ code: 'IMPORT_VALIDATION', message: 'A workbook file is required.' });
    return this.imports.upload(principal.userId, key, version, file.buffer);
  }

  @Get('admin/imports/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: catalogFailure.notFound, description: catalogFailure.notFound.description })
  async importReport(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string): Promise<CatalogImportDetailResponse> { return this.imports.get(principal.userId, id); }

  @Post('admin/imports/:id/dry-run')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: catalogFailure.notFound, description: catalogFailure.notFound.description })
  @ApiResponse({ status: 409, schema: catalogFailure.importUnavailable, description: catalogFailure.importUnavailable.description })
  async importDryRun(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string): Promise<CatalogImportDryRunResponse> { return this.imports.dryRun(principal.userId, id); }

  @Post('admin/imports/:id/commit')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  @ApiResponse({ status: 401, schema: catalogFailure.unauthorized, description: catalogFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: catalogFailure.forbidden, description: catalogFailure.forbidden.description })
  @ApiResponse({ status: 404, schema: catalogFailure.notFound, description: catalogFailure.notFound.description })
  @ApiResponse({ status: 409, schema: catalogFailure.importUnavailable, description: catalogFailure.importUnavailable.description })
  @ApiResponse({ status: 422, schema: catalogFailure.importValidation, description: catalogFailure.importValidation.description })
  async commitImport(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Param('id') id: string): Promise<CatalogImportCommitResponse> { return this.imports.commit(principal.userId, key, id); }
}
