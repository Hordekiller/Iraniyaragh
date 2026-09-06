import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import type { BrandListResponse, BrandResponse, CategoryListResponse, CategoryResponse, CategoryTreeResponse, ProductDetailResponse, ProductListResponse, ProductStatusResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CatalogService } from './catalog.service';
import { BrandCreateDto, BrandUpdateDto, CategoryCreateDto, CategoryUpdateDto, ProductCreateDto, ProductListQueryDto, ProductStatusDto } from './catalog.dto';

@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @Header('Cache-Control', 'no-store')
  async publicProducts(@Query() query: ProductListQueryDto): Promise<ProductListResponse> { return this.catalog.listPublicProducts(query); }

  @Get('products/:idOrSlug')
  async publicProduct(@Param('idOrSlug') idOrSlug: string): Promise<ProductDetailResponse> { return this.catalog.getPublicProduct(idOrSlug); }

  @Get('categories')
  async categories(): Promise<CategoryListResponse> { return this.catalog.listCategories(); }

  @Get('categories/tree')
  async categoryTree(): Promise<CategoryTreeResponse> { return this.catalog.categoryTree(); }

  @Get('brands')
  async brands(): Promise<BrandListResponse> { return this.catalog.listBrands(); }

  @Get('admin/products')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.read')
  async adminProducts(@Query() query: ProductListQueryDto): Promise<ProductListResponse> { return this.catalog.listAdminProducts(query); }

  @Post('admin/products')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async createProduct(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: ProductCreateDto): Promise<ProductDetailResponse> { return this.catalog.createProduct(principal.userId, input); }

  @Post('admin/products/:id/status')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async status(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: ProductStatusDto): Promise<ProductStatusResponse> { return this.catalog.changeProductStatus(principal.userId, id, input); }

  @Post('admin/brands')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async createBrand(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: BrandCreateDto): Promise<BrandResponse> { return this.catalog.createBrand(principal.userId, input); }

  @Patch('admin/brands/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateBrand(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: BrandUpdateDto): Promise<BrandResponse> { return this.catalog.updateBrand(principal.userId, id, input); }

  @Post('admin/categories')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async createCategory(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: CategoryCreateDto): Promise<CategoryResponse> { return this.catalog.createCategory(principal.userId, input); }

  @Patch('admin/categories/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('catalog.write')
  async updateCategory(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: CategoryUpdateDto): Promise<CategoryResponse> { return this.catalog.updateCategory(principal.userId, id, input); }
}
