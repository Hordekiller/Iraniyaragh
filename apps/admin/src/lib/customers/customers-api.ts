import type {
  AdminCustomerAddressesRequest,
  AdminCustomerAuditResponse,
  AdminCustomerCreateRequest,
  AdminCustomerDetailResponse,
  AdminCustomerListResponse,
  AdminCustomerNoteRequest,
  AdminCustomerUpdateRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import type { AdminCustomerQuery, AdminCustomersApi } from './customers-types';

function toQuery(query: AdminCustomerQuery): string {
  const params = new URLSearchParams();
  const values: Record<string, string | number | boolean | undefined> = {
    page: query.page,
    perPage: query.perPage,
    search: query.search,
    status: query.status,
    hasUserAccount: query.hasUserAccount,
    sortBy: query.sortBy,
    sortDir: query.sortDir,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/**
 * A fresh key per attempted command. Retrying the *same* logical command after
 * an ambiguous network failure must reuse the key so the API replays instead of
 * duplicating; a new key is minted only when the operator submits again.
 */
export function newCustomerCommandKey(command: string): string {
  return `customer-${command}-${globalThis.crypto.randomUUID()}`;
}

export async function listCustomers(query: AdminCustomerQuery, signal?: AbortSignal) {
  const response = await apiFetch<AdminCustomerListResponse['data']>(
    `/customers/admin${toQuery(query)}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export async function getCustomer(id: string, signal?: AbortSignal) {
  const response = await apiFetch<AdminCustomerDetailResponse['data']>(
    `/customers/admin/${encodeURIComponent(id)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.customer;
}

export async function createCustomer(
  input: AdminCustomerCreateRequest,
  idempotencyKey: string,
): Promise<void> {
  await apiFetch<AdminCustomerListResponse['data']>('/customers/admin', {
    method: 'POST',
    token: getAccessToken(),
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export async function updateCustomer(
  id: string,
  input: AdminCustomerUpdateRequest,
  idempotencyKey: string,
): Promise<void> {
  await apiFetch<AdminCustomerDetailResponse['data']['customer']>(
    `/customers/admin/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
}

export async function replaceAddresses(
  id: string,
  input: AdminCustomerAddressesRequest,
  idempotencyKey: string,
): Promise<void> {
  await apiFetch<AdminCustomerDetailResponse['data']['customer']>(
    `/customers/admin/${encodeURIComponent(id)}/addresses`,
    {
      method: 'PUT',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
}

export async function addNote(
  id: string,
  input: AdminCustomerNoteRequest,
  idempotencyKey: string,
): Promise<void> {
  await apiFetch<AdminCustomerNoteRequest>(
    `/customers/admin/${encodeURIComponent(id)}/notes`,
    {
      method: 'POST',
      token: getAccessToken(),
      body: input,
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );
}

export async function listCustomerHistory(
  id: string,
  page: number,
  perPage: number,
  signal?: AbortSignal,
): Promise<AdminCustomerAuditResponse['data']> {
  const response = await apiFetch<AdminCustomerAuditResponse['data']>(
    `/customers/admin/${encodeURIComponent(id)}/history?page=${page}&perPage=${perPage}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export const customersApi: AdminCustomersApi = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  replaceAddresses,
  addNote,
  listCustomerHistory,
};
