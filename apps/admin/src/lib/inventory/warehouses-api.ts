import type {
  Warehouse, WarehouseCreateRequest, WarehouseListResponse, WarehouseLocation,
  WarehouseLocationCreateRequest, WarehouseLocationListResponse,
  WarehouseLocationUpdateRequest, WarehouseUpdateRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export type WarehouseQuery = { offset: number; limit: number; isActive?: boolean; isInactive?: boolean };

function queryString(query: WarehouseQuery): string {
  const params = new URLSearchParams({ offset: String(query.offset), limit: String(query.limit) });
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.isInactive !== undefined) params.set('isInactive', String(query.isInactive));
  return params.toString();
}

export async function listWarehouses(query: WarehouseQuery, signal?: AbortSignal): Promise<WarehouseListResponse> {
  const response = await apiFetch<WarehouseListResponse>(`/inventory/warehouses?${queryString(query)}`, {
    token: getAccessToken(), signal,
  });
  return response.data;
}

export async function createWarehouse(input: WarehouseCreateRequest): Promise<Warehouse> {
  const response = await apiFetch<Warehouse>('/inventory/warehouses', {
    method: 'POST', token: getAccessToken(), body: input,
  });
  return response.data;
}

export async function updateWarehouse(id: string, input: WarehouseUpdateRequest): Promise<Warehouse> {
  const response = await apiFetch<Warehouse>(`/inventory/warehouses/${encodeURIComponent(id)}`, {
    method: 'PATCH', token: getAccessToken(), body: input,
  });
  return response.data;
}

export async function listLocations(
  warehouseId: string, query: WarehouseQuery, signal?: AbortSignal,
): Promise<WarehouseLocationListResponse> {
  const response = await apiFetch<WarehouseLocationListResponse>(
    `/inventory/warehouses/${encodeURIComponent(warehouseId)}/locations?${queryString(query)}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export async function createLocation(warehouseId: string, input: WarehouseLocationCreateRequest): Promise<WarehouseLocation> {
  const response = await apiFetch<WarehouseLocation>(`/inventory/warehouses/${encodeURIComponent(warehouseId)}/locations`, {
    method: 'POST', token: getAccessToken(), body: input,
  });
  return response.data;
}

export async function updateLocation(id: string, input: WarehouseLocationUpdateRequest): Promise<WarehouseLocation> {
  const response = await apiFetch<WarehouseLocation>(`/inventory/locations/${encodeURIComponent(id)}`, {
    method: 'PATCH', token: getAccessToken(), body: input,
  });
  return response.data;
}
