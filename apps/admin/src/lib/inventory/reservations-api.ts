import type { InventoryLifecycleRequest, Reservation, ReservationCreateRequest, ReservationListResponse, ReservationStatus } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export type ReservationQuery = { warehouseId?: string; variantId?: string; status?: ReservationStatus; offset?: number; limit?: number };

export function listReservations(query: ReservationQuery, signal?: AbortSignal): Promise<ReservationListResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return apiFetch<ReservationListResponse>(`/inventory/reservations?${params}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function createManualReservation(input: Omit<ReservationCreateRequest, 'orderId'>, idempotencyKey: string): Promise<Reservation> {
  return apiFetch<Reservation>('/inventory/reservations', {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}

export function transitionManualReservation(id: string, action: 'release' | 'consume', input: InventoryLifecycleRequest): Promise<Reservation> {
  return apiFetch<Reservation>(`/inventory/reservations/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', token: getAccessToken(), body: input, responseShape: 'raw',
  });
}
