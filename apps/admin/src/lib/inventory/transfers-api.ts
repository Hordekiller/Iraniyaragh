import type { StockTransfer, TransferActionRequest, TransferCreateRequest, TransferListResponse, TransferStatus } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export type TransferQuery = { status?: TransferStatus; sourceWarehouseId?: string; targetWarehouseId?: string; offset?: number; limit?: number };
export type TransferAction = 'request' | 'approve' | 'dispatch' | 'receive' | 'cancel';

export function listTransfers(query: TransferQuery, signal?: AbortSignal): Promise<TransferListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return apiFetch<TransferListResponse>(`/inventory/transfers?${params}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function getTransfer(id: string, signal?: AbortSignal): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/inventory/transfers/${encodeURIComponent(id)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function createTransfer(input: TransferCreateRequest, idempotencyKey: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>('/inventory/transfers', {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}

export function transitionTransfer(id: string, action: TransferAction, input: TransferActionRequest, idempotencyKey: string): Promise<StockTransfer> {
  return apiFetch<StockTransfer>(`/inventory/transfers/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}
