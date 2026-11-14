import type { StorefrontContactsAdminResponse, StorefrontContactsUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export async function readStorefrontContacts(signal?: AbortSignal) {
  return (await apiFetch<StorefrontContactsAdminResponse['data']>('/catalog/storefront-contacts/admin', { token: getAccessToken(), signal })).data.config;
}

export async function saveStorefrontContacts(body: StorefrontContactsUpdate) {
  return (await apiFetch<StorefrontContactsAdminResponse['data']>('/catalog/storefront-contacts/admin', { token: getAccessToken(), method: 'PUT', body })).data.config;
}
