import type { ApiSuccess, Money } from './index';

export type CatalogStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type CategoryNode = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  children: CategoryNode[];
  createdAt: string;
  updatedAt: string;
};

export type CategoryTreeResponse = ApiSuccess<{ tree: CategoryNode[] }>;

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
};

export type CategoryListResponse = ApiSuccess<{ items: CategorySummary[] }>;

export type CategoryCreateRequest = {
  name: string;
  slug: string;
  parentId?: string;
};

export type CategoryUpdateRequest = {
  name?: string;
  slug?: string;
  parentId?: string | null;
};

export type CategoryResponse = ApiSuccess<{ category: CategoryNode }>;

export type BrandSummary = {
  id: string;
  name: string;
  slug: string;
  productCount: number;
};

export type BrandListResponse = ApiSuccess<{ items: BrandSummary[] }>;

export type BrandCreateRequest = {
  name: string;
  slug: string;
};

export type BrandUpdateRequest = {
  name?: string;
  slug?: string;
};

export type BrandResponse = ApiSuccess<{ brand: BrandSummary }>;

export type ProductVariantPayload = {
  sku: string;
  barcode?: string;
  title?: string;
  costPrice: Money;
  salePrice: Money;
  weightGrams?: number;
  isActive?: boolean;
};

export type ProductPayload = {
  name: string;
  slug: string;
  description?: string;
  brandId?: string;
  categoryId?: string;
  status?: CatalogStatus;
  variants?: ProductVariantPayload[];
};

export type ProductCreateRequest = ProductPayload;
export type ProductUpdateRequest = Partial<ProductPayload>;

export type ProductListItem = {
  id: string;
  name: string;
  slug: string;
  status: CatalogStatus;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductListQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  status?: CatalogStatus;
  brandId?: string;
  categoryId?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortDir?: 'asc' | 'desc';
};

export type ProductListMeta = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
};

export type ProductListResponse = ApiSuccess<{ items: ProductListItem[]; meta: ProductListMeta }>;

export type ProductVariant = ProductVariantPayload & {
  id: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = ProductListItem & {
  description: string | null;
  brand: BrandSummary | null;
  category: CategorySummary | null;
  variants: ProductVariant[];
};

export type ProductDetailResponse = ApiSuccess<{ product: ProductDetail }>;

export type ProductStatusAction =
  | { action: 'publish' }
  | { action: 'unpublish' }
  | { action: 'archive' };

export type ProductStatusResponse = ApiSuccess<{ product: ProductDetail }>;