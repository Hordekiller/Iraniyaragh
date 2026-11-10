import type { InvoicePdfCapacityConfig, InvoicePdfCapacityResponse, InvoicePdfCapacityUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const path = '/settings/admin/invoice-pdf-capacity';

export async function readInvoicePdfCapacity(signal?: AbortSignal): Promise<InvoicePdfCapacityConfig> {
  return (await apiFetch<InvoicePdfCapacityResponse['data']>(path, { token: getAccessToken(), signal })).data.capacity;
}
export async function saveInvoicePdfCapacity(input: InvoicePdfCapacityUpdate, signal?: AbortSignal): Promise<InvoicePdfCapacityConfig> {
  return (await apiFetch<InvoicePdfCapacityResponse['data']>(path, { token: getAccessToken(), signal, method: 'PUT', body: input })).data.capacity;
}
