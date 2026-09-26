import type { AdminOrderDetailResponse, AdminOrderListResponse, FulfillmentPickListResponse, FulfillmentPickResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import type { AdminOrderQuery, AdminOrdersApi } from './orders-types';

function toQuery(query: AdminOrderQuery): string {
  const params = new URLSearchParams();
  const values: Record<string, string | number | undefined> = {
    page: query.page,
    perPage: query.perPage,
    search: query.search,
    status: query.orderStatus,
    paymentStatus: query.paymentStatus,
    fulfillmentStatus: query.fulfillmentStatus,
    createdFrom: query.createdFrom,
    createdTo: query.createdTo,
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

export async function listOrders(query: AdminOrderQuery, signal?: AbortSignal) {
  const response = await apiFetch<AdminOrderListResponse['data']>(`/orders/admin${toQuery(query)}`, {
    token: getAccessToken(),
    signal,
  });
  return response.data;
}

export async function getOrder(id: string, signal?: AbortSignal) {
  const response = await apiFetch<AdminOrderDetailResponse['data']>(
    `/orders/admin/${encodeURIComponent(id)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.order;
}

export async function getPicks(id: string, signal?: AbortSignal) {
  const response = await apiFetch<FulfillmentPickListResponse['data']>(
    `/orders/admin/${encodeURIComponent(id)}/fulfillment/picks`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

async function fulfillmentCommand(id: string, command: 'start' | 'ready', idempotencyKey: string) {
  await apiFetch(`/orders/admin/${encodeURIComponent(id)}/fulfillment/${command}`, {
    method: 'POST', token: getAccessToken(), headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export async function startFulfillment(id: string, idempotencyKey: string) {
  return fulfillmentCommand(id, 'start', idempotencyKey);
}

export async function markReady(id: string, idempotencyKey: string) {
  return fulfillmentCommand(id, 'ready', idempotencyKey);
}

export async function recordPick(id: string, itemId: string, quantity: number, idempotencyKey: string) {
  await apiFetch<FulfillmentPickResponse['data']>(
    `/orders/admin/${encodeURIComponent(id)}/fulfillment/items/${encodeURIComponent(itemId)}/pick`,
    { method: 'POST', body: { quantity }, token: getAccessToken(), headers: { 'Idempotency-Key': idempotencyKey } },
  );
}

export async function dispatchShipment(id: string, carrier: string, trackingCode: string, idempotencyKey: string) {
  await apiFetch(`/orders/admin/${encodeURIComponent(id)}/shipment/dispatch`, {
    method: 'POST', body: { carrier, trackingCode }, token: getAccessToken(),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export const ordersApi: AdminOrdersApi = { listOrders, getOrder, getPicks, startFulfillment, markReady, recordPick, dispatchShipment };
