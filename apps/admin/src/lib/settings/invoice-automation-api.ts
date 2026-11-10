import type { InvoiceAutomationConfig, InvoiceAutomationResponse, InvoiceAutomationUpdate } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const path = '/settings/admin/invoice-automation';

export async function readInvoiceAutomation(signal?: AbortSignal): Promise<InvoiceAutomationConfig> {
  return (await apiFetch<InvoiceAutomationResponse['data']>(path, { token: getAccessToken(), signal })).data.config;
}
export async function saveInvoiceAutomation(input: InvoiceAutomationUpdate, signal?: AbortSignal): Promise<InvoiceAutomationConfig> {
  return (await apiFetch<InvoiceAutomationResponse['data']>(path, { token: getAccessToken(), signal, method: 'PUT', body: input })).data.config;
}
