import type { AdminShipmentDetailResponse, AdminShipmentListResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
import type {
  AdminShipmentListResult,
  AdminShipmentQuery,
  AdminShipmentsApi,
} from './shipments-types';

function toQuery(query: AdminShipmentQuery): string {
  const params = new URLSearchParams();
  const values: Record<string, string | number | undefined> = {
    page: query.page,
    perPage: query.perPage,
    status: query.status,
    carrier: query.carrier,
    trackingCode: query.trackingCode,
    dispatchedFrom: query.dispatchedFrom,
    dispatchedTo: query.dispatchedTo,
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

export async function listShipments(
  query: AdminShipmentQuery,
  signal?: AbortSignal,
): Promise<AdminShipmentListResult> {
  const response = await apiFetch<AdminShipmentListResponse['data']>(
    `/shipments/admin${toQuery(query)}`,
    { token: getAccessToken(), signal },
  );
  return response.data;
}

export async function getShipment(id: string, signal?: AbortSignal) {
  const response = await apiFetch<AdminShipmentDetailResponse['data']>(
    `/shipments/admin/${encodeURIComponent(id)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.shipment;
}

export const shipmentsApi: AdminShipmentsApi = { listShipments, getShipment };
