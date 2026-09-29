import type { PurchaseOrder, PurchaseOrderActionRequest, PurchaseOrderAuditResponse, PurchaseOrderCreateRequest, PurchaseOrderListResponse, PurchaseOrderOptionKind, PurchaseOrderOptionsResponse, PurchaseOrderStatus, PurchaseOrderUpdateRequest, PurchaseReceipt, PurchaseReceiptCreateRequest, PurchaseReceiptListResponse, PurchaseReceiptLocationOptionsResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const token = () => getAccessToken();
const path = (id: string) => `/purchase-orders/${encodeURIComponent(id)}`;
export const newPurchaseOrderCommandKey = () => `po-${globalThis.crypto.randomUUID()}`;
export const newPurchaseReceiptCommandKey = () => `po-receipt-${globalThis.crypto.randomUUID()}`;

export function listPurchaseOrders(query: { offset: number; limit: number; status?: PurchaseOrderStatus }, signal?: AbortSignal): Promise<PurchaseOrderListResponse> {
  const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
  if (query.status) params.set('status', query.status);
  return apiFetch<PurchaseOrderListResponse>(`/purchase-orders?${params}`, { token: token(), signal, responseShape: 'raw' });
}
export function getPurchaseOrder(id: string, signal?: AbortSignal): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>(path(id), { token: token(), signal, responseShape: 'raw' });
}
export function listPurchaseOrderOptions(kind: PurchaseOrderOptionKind, search: string, signal?: AbortSignal): Promise<PurchaseOrderOptionsResponse> {
  const params = new URLSearchParams({ kind, search, offset: '0', limit: '50' });
  return apiFetch<PurchaseOrderOptionsResponse>(`/purchase-orders/options?${params}`, { token: token(), signal, responseShape: 'raw' });
}
export function listPurchaseOrderHistory(id: string, signal?: AbortSignal): Promise<PurchaseOrderAuditResponse> {
  return apiFetch<PurchaseOrderAuditResponse>(`${path(id)}/history?offset=0&limit=100`, { token: token(), signal, responseShape: 'raw' });
}
export function createPurchaseOrder(input: PurchaseOrderCreateRequest, key: string): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>('/purchase-orders', { method: 'POST', token: token(), body: input, headers: { 'Idempotency-Key': key }, responseShape: 'raw' });
}
export function updatePurchaseOrder(id: string, input: PurchaseOrderUpdateRequest, key: string): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>(path(id), { method: 'PATCH', token: token(), body: input, headers: { 'Idempotency-Key': key }, responseShape: 'raw' });
}
export function transitionPurchaseOrder(id: string, action: 'approve' | 'cancel', input: PurchaseOrderActionRequest, key: string): Promise<PurchaseOrder> {
  return apiFetch<PurchaseOrder>(`${path(id)}/${action}`, { method: 'POST', token: token(), body: input, headers: { 'Idempotency-Key': key }, responseShape: 'raw' });
}
export function listPurchaseOrderReceipts(id: string, offset = 0, limit = 20, signal?: AbortSignal): Promise<PurchaseReceiptListResponse> {
  return apiFetch<PurchaseReceiptListResponse>(`${path(id)}/receipts?offset=${offset}&limit=${limit}`, { token: token(), signal, responseShape: 'raw' });
}
export function listPurchaseReceiptLocations(id: string, search: string, signal?: AbortSignal): Promise<PurchaseReceiptLocationOptionsResponse> {
  const params = new URLSearchParams({ search, offset: '0', limit: '50' });
  return apiFetch<PurchaseReceiptLocationOptionsResponse>(`${path(id)}/receipt-locations?${params}`, { token: token(), signal, responseShape: 'raw' });
}
export function receivePurchaseOrder(id: string, input: PurchaseReceiptCreateRequest, key: string): Promise<PurchaseReceipt> {
  return apiFetch<PurchaseReceipt>(`${path(id)}/receipts`, { method: 'POST', token: token(), body: input,
    headers: { 'Idempotency-Key': key }, responseShape: 'raw' });
}
