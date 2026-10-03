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
  ProductDescriptionUpdateRequest,
  AttributeDefinitionCreateRequest,
  AttributeDefinitionResponse,
  AttributeDefinitionUpdateRequest,
  AttributeListResponse,
  AttributeOptionCreateRequest,
  AttributeOptionResponse,
  AttributeOptionUpdateRequest,
  CatalogImportCommitResponse,
  CatalogImportDetailResponse,
  CatalogImportDryRunResponse,
  CatalogImportUploadResponse,
  ProductAttributeConfigurationPayload,
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
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import { randomUuid } from '@/lib/crypto/random-uuid';

export const CATALOG_IMPORT_REQUEST_VERSION = '1';

function toQuery(query: ProductListQuery): string {
  const params = new URLSearchParams();
  if (query.page) params.set('page', String(query.page));
  if (query.perPage) params.set('perPage', String(query.perPage));
  if (query.search) params.set('search', query.search);
  if (query.status) params.set('status', query.status);
  if (query.brandId) params.set('brandId', query.brandId);
  if (query.categoryId) params.set('categoryId', query.categoryId);
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortDir) params.set('sortDir', query.sortDir);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
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

export async function createAttribute(
  input: AttributeDefinitionCreateRequest,
  idempotencyKey: string,
): Promise<AttributeDefinitionResponse['data']> {
  const response = await apiFetch<AttributeDefinitionResponse['data']>('/catalog/admin/attributes', {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function configureProductAttributes(
  id: string,
  expectedVersion: number,
  configurations: ProductAttributeConfigurationPayload[],
): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>(`/catalog/admin/products/${id}/attributes`, {
    method: 'PATCH',
    body: { expectedVersion, configurations },
    token: authToken(),
  });
  return response.data;
}

export async function listAttributes(signal?: AbortSignal): Promise<AttributeListResponse['data']> {
  const response = await apiFetch<AttributeListResponse['data']>('/catalog/admin/attributes', {
    token: authToken(), signal,
  });
  return response.data;
}

export async function getAttribute(id: string, signal?: AbortSignal): Promise<AttributeDefinitionResponse['data']> {
  const response = await apiFetch<AttributeDefinitionResponse['data']>(`/catalog/admin/attributes/${id}`, {
    token: authToken(), signal,
  });
  return response.data;
}

export async function createAttributeOption(
  attributeId: string,
  input: AttributeOptionCreateRequest,
  idempotencyKey: string,
): Promise<AttributeOptionResponse['data']> {
  const response = await apiFetch<AttributeOptionResponse['data']>(`/catalog/admin/attributes/${attributeId}/options`, {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function updateAttribute(id: string, input: AttributeDefinitionUpdateRequest): Promise<AttributeDefinitionResponse['data']> {
  const response = await apiFetch<AttributeDefinitionResponse['data']>(`/catalog/admin/attributes/${id}`, {
    method: 'PATCH', body: input, token: authToken(),
  });
  return response.data;
}

export async function updateAttributeOption(attributeId: string, optionId: string, input: AttributeOptionUpdateRequest): Promise<AttributeOptionResponse['data']> {
  const response = await apiFetch<AttributeOptionResponse['data']>(`/catalog/admin/attributes/${attributeId}/options/${optionId}`, {
    method: 'PATCH', body: input, token: authToken(),
  });
  return response.data;
}

export async function updateVariant(id: string, input: ProductVariantUpdateRequest): Promise<ProductVariantResponse['data']> {
  const response = await apiFetch<ProductVariantResponse['data']>(`/catalog/admin/variants/${id}`, {
    method: 'PATCH', body: input, token: authToken(),
  });
  return response.data;
}

export async function changeVariantStatus(id: string, input: ProductVariantStatusRequest, idempotencyKey: string): Promise<ProductVariantResponse['data']> {
  const response = await apiFetch<ProductVariantResponse['data']>(`/catalog/admin/variants/${id}/status`, {
    method: 'POST', body: input, token: authToken(), headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function updateVariantPrice(id: string, input: VariantPriceUpdateRequest): Promise<VariantPriceResponse['data']> {
  const response = await apiFetch<VariantPriceResponse['data']>(`/catalog/admin/variants/${id}/price`, {
    method: 'PATCH', body: input, token: authToken(),
  });
  return response.data;
}

export async function getVariantPriceHistory(id: string, signal?: AbortSignal): Promise<VariantPriceHistoryResponse['data']> {
  const response = await apiFetch<VariantPriceHistoryResponse['data']>(`/catalog/admin/variants/${id}/price-history`, {
    token: authToken(), signal,
  });
  return response.data;
}

export async function previewVariantGeneration(productId: string, input: VariantGeneratePreviewRequest, signal?: AbortSignal): Promise<VariantGeneratePreviewResponse['data']> {
  const response = await apiFetch<VariantGeneratePreviewResponse['data']>(`/catalog/admin/products/${productId}/variants/preview`, {
    method: 'POST', body: input, token: authToken(), signal,
  });
  return response.data;
}

export async function generateVariants(productId: string, input: VariantGenerateRequest, idempotencyKey: string): Promise<VariantGenerateResponse['data']> {
  const response = await apiFetch<VariantGenerateResponse['data']>(`/catalog/admin/products/${productId}/variants/generate`, {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function uploadCatalogImport(file: Blob, fileName: string, idempotencyKey: string, version = CATALOG_IMPORT_REQUEST_VERSION): Promise<CatalogImportUploadResponse['data']> {
  const form = new FormData();
  form.append('file', file, fileName);
  const response = await apiFetch<CatalogImportUploadResponse['data']>('/catalog/admin/imports', {
    method: 'POST', body: form, token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey, 'x-iranyaragh-catalog-version': version },
  });
  return response.data;
}

export async function getCatalogImport(id: string, signal?: AbortSignal): Promise<CatalogImportDetailResponse['data']> {
  const response = await apiFetch<CatalogImportDetailResponse['data']>(`/catalog/admin/imports/${id}`, {
    token: authToken(), signal,
  });
  return response.data;
}

export async function runCatalogImportDryRun(id: string): Promise<CatalogImportDryRunResponse['data']> {
  const response = await apiFetch<CatalogImportDryRunResponse['data']>(`/catalog/admin/imports/${id}/dry-run`, {
    method: 'POST', token: authToken(),
  });
  return response.data;
}

export async function commitCatalogImport(id: string, idempotencyKey: string): Promise<CatalogImportCommitResponse['data']> {
  const response = await apiFetch<CatalogImportCommitResponse['data']>(`/catalog/admin/imports/${id}/commit`, {
    method: 'POST', token: authToken(), headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}
