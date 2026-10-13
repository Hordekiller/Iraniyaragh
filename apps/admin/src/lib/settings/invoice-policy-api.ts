import type { InvoicePolicy, InvoicePolicyResponse, InvoicePolicyUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
const path = '/settings/admin/invoice-policy';
export async function readInvoicePolicy(signal?: AbortSignal): Promise<InvoicePolicy | null> {
  return (await apiFetch<InvoicePolicyResponse['data']>(path, { token: getAccessToken(), signal })).data.policy;
}
export async function saveInvoicePolicy(body: InvoicePolicyUpdate, key: string, signal?: AbortSignal): Promise<InvoicePolicy> {
  const result = (await apiFetch<InvoicePolicyResponse['data']>(path, { method: 'PUT', token: getAccessToken(), body,
    headers: { 'Idempotency-Key': key }, signal })).data.policy;
  if (!result) throw new Error('Invoice policy mutation returned no revision.');
  return result;
}
