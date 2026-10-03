import type {
  AttributeDefinitionCreateRequest,
  AttributeDefinitionResponse,
  AttributeDefinitionUpdateRequest,
  AttributeListResponse,
  AttributeOptionCreateRequest,
  AttributeOptionResponse,
  AttributeOptionUpdateRequest,
  BrandCreateRequest,
  BrandListResponse,
  BrandResponse,
  BrandSummary,
  BrandUpdateRequest,
  CatalogImportCommitResponse,
  CatalogImportDetailResponse,
  CatalogImportDryRunResponse,
  CatalogImportUploadResponse,
  CategoryCreateRequest,
  CategoryListResponse,
  CategoryResponse,
  CategorySummary,
  CategoryTreeResponse,
  CategoryUpdateRequest,
  ProductAttributeConfigurationPayload,
  ProductCreateRequest,
  ProductDescriptionUpdateRequest,
  ProductDetailResponse,
  ProductListQuery,
  ProductListResponse,
  ProductStatusAction,
  ProductStatusResponse,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import { randomUuid } from '@/lib/crypto/random-uuid';

export const CATALOG_IMPORT_REQUEST_VERSION = '1';

function toQuery(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

function authToken(): string | null {
  return getAccessToken();
}

export async function listProducts(query: ProductListQuery, signal?: AbortSignal): Promise<ProductListResponse['data']> {
  const response = await apiFetch<ProductListResponse['data']>(
    `/catalog/admin/products${toQuery(query)}`,
    { token: authToken(), signal },
  );
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
  idempotencyKey: string,
): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>(`/catalog/admin/products/${id}/description`, {
    method: 'PATCH',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

export async function listBrands(signal?: AbortSignal): Promise<BrandSummary[]> {
  const response = await apiFetch<BrandListResponse['data']>('/catalog/brands', { signal });
  return response.data.items;
}


export async function listCategories(signal?: AbortSignal): Promise<CategorySummary[]> {
  const response = await apiFetch<CategoryListResponse['data']>('/catalog/categories', { signal });
  return response.data.items;
}

export async function listCategoryTree(signal?: AbortSignal): Promise<CategoryTreeResponse['data']> {
  const response = await apiFetch<CategoryTreeResponse['data']>('/catalog/categories/tree', { signal });
  return response.data;
}

export async function updateCategory(
  id: string,
  input: CategoryUpdateRequest,
): Promise<CategoryResponse['data']> {
  const response = await apiFetch<CategoryResponse['data']>(`/catalog/admin/categories/${id}`, {
    method: 'PATCH',
    body: input,
    token: authToken(),
  });
  return response.data;
}

    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
  return response.data;
}

    method: 'PATCH',
    body: input,
    token: authToken(),
  });
  return response.data;
