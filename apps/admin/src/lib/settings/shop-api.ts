import type { ShopAdminResponse, ShopUpdate, StorefrontAssetListResponse, ProductMediaUploadResponse, ProductMediaConfirmResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import { createIdempotencyKey } from '@/lib/catalog/catalog-api';
const root = '/catalog/admin/storefront-assets';
export async function readShop(signal?: AbortSignal) { return (await apiFetch<ShopAdminResponse['data']>('/catalog/shop/admin', { token: getAccessToken(), signal })).data.config; }
export async function saveShop(body: ShopUpdate, key: string) { return (await apiFetch<ShopAdminResponse['data']>('/catalog/shop/admin', { token: getAccessToken(), method: 'PUT', body, headers: { 'Idempotency-Key': key } })).data.config; }
export async function listAssets(signal?: AbortSignal, page = 1, selectedId?: string | null) { return (await apiFetch<StorefrontAssetListResponse['data']>(`${root}?page=${page}${selectedId ? `&selectedId=${encodeURIComponent(selectedId)}` : ''}`, { token: getAccessToken(), signal })).data.items; }
export async function startAsset(file: File, altText: string) { return (await apiFetch<ProductMediaUploadResponse['data']>(`${root}/uploads`, { token: getAccessToken(), method: 'POST', body: { originalFilename: file.name, declaredMime: file.type, bytes: file.size, altText }, headers: { 'Idempotency-Key': createIdempotencyKey('asset-upload') } })).data.upload; }
export async function confirmAsset(id: string, key: string) { return (await apiFetch<ProductMediaConfirmResponse['data']>(`${root}/${encodeURIComponent(id)}/confirm`, { token: getAccessToken(), method: 'POST', body: {}, headers: { 'Idempotency-Key': key } })).data.media; }
export async function archiveAsset(id: string, expectedVersion: number) { return apiFetch(`${root}/${encodeURIComponent(id)}/archive`, { token: getAccessToken(), method: 'POST', body: { expectedVersion }, headers: { 'Idempotency-Key': createIdempotencyKey('asset-archive') } }); }
