import type {
  StocktakeActionRequest, StocktakeAuditResponse, StocktakeCountRequest, StocktakeCreateRequest,
  StocktakeDetail, StocktakeListResponse, StocktakeLocationOptionsResponse, StocktakeStatus,
  StocktakeVariantOptionsResponse,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export const newStocktakeCommandKey = () => `st-${globalThis.crypto.randomUUID()}`;

export function listStocktakes(query: { status?: StocktakeStatus; warehouseId?: string; offset?: number; limit?: number },
  signal?: AbortSignal): Promise<StocktakeListResponse> {
  return apiFetch<StocktakeListResponse>(`/stocktakes?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function getStocktake(id: string, signal?: AbortSignal): Promise<StocktakeDetail> {
  return apiFetch<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function getStocktakeHistory(id: string, query: { offset?: number; limit?: number }, signal?: AbortSignal): Promise<StocktakeAuditResponse> {
  return apiFetch<StocktakeAuditResponse>(`/stocktakes/${encodeURIComponent(id)}/history?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function listStocktakeLocations(query: { warehouseId?: string; search?: string; limit?: number },
  signal?: AbortSignal): Promise<StocktakeLocationOptionsResponse> {
  return apiFetch<StocktakeLocationOptionsResponse>(`/stocktakes/locations?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function listStocktakeVariants(query: { search?: string; limit?: number },
  signal?: AbortSignal): Promise<StocktakeVariantOptionsResponse> {
  return apiFetch<StocktakeVariantOptionsResponse>(`/stocktakes/variants?${queryString(query)}`, {
    token: getAccessToken(), signal, responseShape: 'raw',
  });
}

export function createStocktake(input: StocktakeCreateRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return apiFetch<StocktakeDetail>('/stocktakes', {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}

function command<T>(path: string, input: StocktakeActionRequest | StocktakeCountRequest, idempotencyKey: string): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST', token: getAccessToken(), body: input,
    headers: { 'Idempotency-Key': idempotencyKey }, responseShape: 'raw',
  });
}

export function startStocktake(id: string, input: StocktakeActionRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return command<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}/start`, input, idempotencyKey);
}

export function recordStocktakeCounts(id: string, input: StocktakeCountRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return command<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}/counts`, input, idempotencyKey);
}

export function submitStocktake(id: string, input: StocktakeActionRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return command<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}/submit`, input, idempotencyKey);
}

export function approveStocktake(id: string, input: StocktakeActionRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return command<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}/approve`, input, idempotencyKey);
}

export function cancelStocktake(id: string, input: StocktakeActionRequest, idempotencyKey: string): Promise<StocktakeDetail> {
  return command<StocktakeDetail>(`/stocktakes/${encodeURIComponent(id)}/cancel`, input, idempotencyKey);
}
