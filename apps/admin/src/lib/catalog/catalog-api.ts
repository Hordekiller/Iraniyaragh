import type {
  BrandCreateRequest,
  BrandListResponse,
  BrandResponse,
  BrandSummary,
  BrandUpdateRequest,
  CategoryCreateRequest,
  CategoryListResponse,
  CategoryResponse,
  CategorySummary,
  CategoryTreeResponse,
  CategoryUpdateRequest,
  ProductCreateRequest,
  ProductDetailResponse,
  ProductListQuery,
  ProductListResponse,
  ProductStatusAction,
  ProductStatusResponse,
  ProductVariantResponse,
  ProductVariantStatusRequest,
  ProductVariantUpdateRequest,
  VariantGeneratePreviewRequest,
  VariantGeneratePreviewResponse,
  VariantGenerateRequest,
  VariantGenerateResponse,
  VariantPriceHistoryResponse,
  VariantPriceResponse,
  VariantPriceUpdateRequest,
  ProductDescriptionUpdateRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

function toQuery(query: ProductListQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.brandId) params.set('brandId', query.brandId);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.search) params.set('search', query.search);
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('perPage', String(query.perPage));
  if ((query as any).limit) params.set('limit', String((query as any).limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function authToken(): string | null {
  return getAccessToken();
}

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${randomUuid()}`;
}

export async function listProducts(query: ProductListQuery, signal?: AbortSignal): Promise<ProductListResponse['data']> {
  const response = await apiFetch<ProductListResponse['data']>(
    `/catalog/admin/products${toQuery(query)}`,
    { token: authToken(), signal },
  );
  return response.data;
}

export async function getProduct(id: string, signal?: AbortSignal): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>(`/catalog/admin/products/${id}`, {
    token: authToken(),
    signal,
  });
  return response.data;
}

export async function createProduct(
  input: ProductCreateRequest,
  idempotencyKey?: string,
): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>('/catalog/admin/products', {
    method: 'POST',
    body: input,
    token: authToken(),
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return response.data;
}

export async function changeProductStatus(
  id: string,
  action: ProductStatusAction['action'],
  idempotencyKey: string,
): Promise<ProductStatusResponse['data']> {
  const response = await apiFetch<ProductStatusResponse['data']>(`/catalog/admin/products/${id}/status`, {
    method: 'POST',
    body: { action },
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function updateProductDescription(
  id: string,
  input: ProductDescriptionUpdateRequest,
  idempotencyKey?: string,
): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>(`/catalog/admin/products/${id}/description`, {
    method: 'PATCH',
    body: input,
    token: authToken(),
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return response.data;
}

export async function listBrands(signal?: AbortSignal): Promise<BrandSummary[]> {
  const response = await apiFetch<BrandListResponse['data']>('/catalog/brands', { signal });
  return response.data.items;
}

export async function createBrand(
  input: BrandCreateRequest,
  idempotencyKey?: string,
): Promise<BrandResponse['data']> {
  const response = await apiFetch<BrandResponse['data']>('/catalog/admin/brands', {
    method: 'POST',
    body: input,
    token: authToken(),
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return response.data;
}

export async function updateBrand(id: string, input: BrandUpdateRequest): Promise<BrandResponse['data']> {
  const response = await apiFetch<BrandResponse['data']>(`/catalog/admin/brands/${id}`, {
    method: 'PATCH',
    body: input,
    token: authToken(),
  });
  return response.data;
}

export async function listCategories(signal?: AbortSignal): Promise<CategorySummary[]> {
  const response = await apiFetch<CategoryListResponse['data']>('/catalog/categories', { signal });
  return response.data.items;
}

export async function listCategoryTree(signal?: AbortSignal): Promise<CategoryTreeResponse['data']> {
  const response = await apiFetch<CategoryTreeResponse['data']>('/catalog/categories/tree', { signal });
  return response.data;
}

export async function createCategory(
  input: CategoryCreateRequest,
  idempotencyKey?: string,
): Promise<CategoryResponse['data']> {
  const response = await apiFetch<CategoryResponse['data']>('/catalog/admin/categories', {
    method: 'POST',
    body: input,
    token: authToken(),
    ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
  });
  return response.data;
}

export async function updateCategory(id: string, input: CategoryUpdateRequest): Promise<CategoryResponse['data']> {
  const response = await apiFetch<CategoryResponse['data']>(`/catalog/admin/categories/${id}`, {
    method: 'PATCH',
    body: input,
    token: authToken(),
  });
  return response.data;
}

// Variant and attribute API stubs for compatibility
export async function changeVariantStatus(..._args: any[]): Promise<any> { return {} as any; }
export async function commitCatalogImport(..._args: any[]): Promise<any> { return {} as any; }
export async function configureProductAttributes(..._args: any[]): Promise<any> { return {} as any; }
export async function createAttribute(..._args: any[]): Promise<any> { return {} as any; }
export async function createAttributeOption(..._args: any[]): Promise<any> { return {} as any; }
export async function generateVariants(..._args: any[]): Promise<any> { return {} as any; }
export async function getAttribute(..._args: any[]): Promise<any> { return {} as any; }
export async function getCatalogImport(..._args: any[]): Promise<any> { return {} as any; }
export async function getVariantPriceHistory(..._args: any[]): Promise<any> { return {} as any; }
export async function listAttributes(..._args: any[]): Promise<any> { return {} as any; }
export async function previewVariantGeneration(..._args: any[]): Promise<any> { return {} as any; }
export async function runCatalogImportDryRun(..._args: any[]): Promise<any> { return {} as any; }
export async function updateAttribute(..._args: any[]): Promise<any> { return {} as any; }
export async function updateAttributeOption(..._args: any[]): Promise<any> { return {} as any; }
export async function updateVariant(..._args: any[]): Promise<any> { return {} as any; }
export async function updateVariantPrice(..._args: any[]): Promise<any> { return {} as any; }
export async function uploadCatalogImport(..._args: any[]): Promise<any> { return {} as any; }
