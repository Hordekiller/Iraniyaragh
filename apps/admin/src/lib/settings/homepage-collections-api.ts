import type { CategoryListResponse, HomepageCollectionsResponse, HomepageCollectionsUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export async function readHomepageCollections(signal?: AbortSignal) {
  const [config, categories] = await Promise.all([
    apiFetch<HomepageCollectionsResponse['data']>('/catalog/homepage-collections/admin', { token: getAccessToken(), signal }),
    apiFetch<CategoryListResponse['data']>('/catalog/categories', { signal }),
  ]);
  return { config: config.data.config, categories: categories.data.items };
}

export async function saveHomepageCollections(body: HomepageCollectionsUpdate, key: string, signal?: AbortSignal) {
  return (await apiFetch<HomepageCollectionsResponse['data']>('/catalog/homepage-collections/admin', {
    token: getAccessToken(), signal, method: 'PUT', body, headers: { 'Idempotency-Key': key },
  })).data.config;
}
