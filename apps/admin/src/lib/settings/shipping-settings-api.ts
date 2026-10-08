import type { ShippingMethodSettingsListResponse, ShippingMethodSettingsResponse, ShippingMethodSettingsUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const path = '/settings/admin/shipping-methods';
export async function readShippingMethods(signal?: AbortSignal) {
  return (await apiFetch<ShippingMethodSettingsListResponse['data']>(path, { token: getAccessToken(), signal })).data.items;
}
export async function saveShippingMethod(code: string, body: ShippingMethodSettingsUpdate, key: string, signal?: AbortSignal) {
  return (await apiFetch<ShippingMethodSettingsResponse['data']>(`${path}/${encodeURIComponent(code)}`, {
    method: 'PUT', token: getAccessToken(), headers: { 'Idempotency-Key': key }, body, signal,
  })).data.method;
}
