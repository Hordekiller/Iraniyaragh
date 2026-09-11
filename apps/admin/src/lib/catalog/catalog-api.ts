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
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

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

export function createIdempotencyKey(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export async function listProducts(query: ProductListQuery, signal?: AbortSignal): Promise<ProductListResponse['data']> {
  const response = await apiFetch<ProductListResponse['data']>(
    `/catalog/admin/products${toQuery(query)}`,
    { token: authToken(), signal },
  );
  return response.data;
}

export async function createProduct(input: ProductCreateRequest, idempotencyKey: string): Promise<ProductDetailResponse['data']> {
  const response = await apiFetch<ProductDetailResponse['data']>('/catalog/admin/products', {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
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

export async function listBrands(signal?: AbortSignal): Promise<BrandSummary[]> {
  const response = await apiFetch<BrandListResponse['data']>('/catalog/brands', { signal });
  return response.data.items;
}

export async function createBrand(input: BrandCreateRequest, idempotencyKey: string): Promise<BrandResponse['data']> {
  const response = await apiFetch<BrandResponse['data']>('/catalog/admin/brands', {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
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

export async function createCategory(input: CategoryCreateRequest, idempotencyKey: string): Promise<CategoryResponse['data']> {
  const response = await apiFetch<CategoryResponse['data']>('/catalog/admin/categories', {
    method: 'POST',
    body: input,
    token: authToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
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
