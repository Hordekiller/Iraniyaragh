import type { StorefrontHelperAdminResponse, StorefrontHelperUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export async function readStorefrontHelper(signal?: AbortSignal) {
  return (await apiFetch<StorefrontHelperAdminResponse['data']>('/catalog/storefront-helper/admin', { token: getAccessToken(), signal })).data.config;
}

export async function saveStorefrontHelper(body: StorefrontHelperUpdate, signal?: AbortSignal) {
  return (await apiFetch<StorefrontHelperAdminResponse['data']>('/catalog/storefront-helper/admin', {
    token: getAccessToken(), signal, method: 'PUT', body,
  })).data.config;
}
