import type { AdminOrderDetailResponse, AdminOrderListResponse } from '@iranyaragh/contracts';
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

export const ordersApi: AdminOrdersApi = { listOrders, getOrder };
