import type {
  InventoryBalanceListResponse, InventoryChangeRequest, InventoryMovement,
  InventoryMovementListResponse, InventoryMovementQuery, InventoryPageQuery,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

function queryString(query: InventoryPageQuery & { type?: string }): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function listBalances(query: InventoryPageQuery, signal?: AbortSignal): Promise<InventoryBalanceListResponse> {
  return apiFetch<InventoryBalanceListResponse>(`/inventory/balances?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function listMovements(query: InventoryMovementQuery, signal?: AbortSignal): Promise<InventoryMovementListResponse> {
  return apiFetch<InventoryMovementListResponse>(`/inventory/movements?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function changeStock(input: InventoryChangeRequest, idempotencyKey: string): Promise<InventoryMovement> {
  return apiFetch<InventoryMovement>('/inventory/changes', {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}
