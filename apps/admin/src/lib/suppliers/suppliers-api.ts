import type {
  Supplier,
  SupplierAuditResponse,
  SupplierCreateRequest,
  SupplierListResponse,
  SupplierUpdateRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export type SupplierQuery = { offset: number; limit: number; isActive?: boolean };

function queryString(query: SupplierQuery): string {
  const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  return params.toString();
}

export function newSupplierCommandKey(command: 'create' | 'update'): string {
  return `supplier-${command}-${globalThis.crypto.randomUUID()}`;
}

export async function listSuppliers(query: SupplierQuery, signal?: AbortSignal): Promise<SupplierListResponse> {
  return apiFetch<SupplierListResponse>(`/suppliers?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export async function getSupplier(id: string, signal?: AbortSignal): Promise<Supplier> {
  return apiFetch<Supplier>(`/suppliers/${encodeURIComponent(id)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export async function listSupplierHistory(
  id: string, query: SupplierQuery, signal?: AbortSignal,
): Promise<SupplierAuditResponse> {
  return apiFetch<SupplierAuditResponse>(
    `/suppliers/${encodeURIComponent(id)}/history?${queryString(query)}`,
    { token: getAccessToken(), signal, responseShape: 'raw' },
  );
}

export async function createSupplier(input: SupplierCreateRequest, idempotencyKey: string): Promise<Supplier> {
  return apiFetch<Supplier>('/suppliers', {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}

export async function updateSupplier(
  id: string, input: SupplierUpdateRequest, idempotencyKey: string,
): Promise<Supplier> {
  return apiFetch<Supplier>(`/suppliers/${encodeURIComponent(id)}`, {
    method: 'PATCH', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}
