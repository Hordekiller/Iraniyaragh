import type {
  ReturnCreateRequest,
  ReturnEligibilityResponse,
  ReturnHolidayCreateRequest,
  ReturnHolidayListResponse,
  ReturnHolidayResponse,
  ReturnListResponse,
  ReturnRefundRequest,
  ReturnRefundResponse,
  ReturnResponse,
  ReturnsSettings,
  ReturnsSettingsResponse,
  ReturnsSettingsUpdate,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const base = '/returns/admin';
const token = () => getAccessToken();
const idempotent = (key: string) => ({ 'Idempotency-Key': key });

export async function getReturnEligibility(orderId: string, signal?: AbortSignal) {
  return (await apiFetch<ReturnEligibilityResponse['data']>(`${base}/orders/${encodeURIComponent(orderId)}/eligibility`, { token: token(), signal })).data;
}

export async function createOrderReturn(orderId: string, body: ReturnCreateRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<ReturnResponse['data']>(`${base}/orders/${encodeURIComponent(orderId)}`, {
    method: 'POST', token: token(), headers: idempotent(key), body, signal,
  })).data;
}

export type ReturnListQuery = { page: number; perPage: number; orderNumber?: string };

export async function listReturns(query: ReturnListQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page), perPage: String(query.perPage) });
  if (query.orderNumber?.trim()) params.set('orderNumber', query.orderNumber.trim());
  return (await apiFetch<ReturnListResponse['data']>(`${base}?${params.toString()}`, { token: token(), signal })).data;
}

export async function recordReturnRefund(returnId: string, body: ReturnRefundRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<ReturnRefundResponse['data']>(`${base}/${encodeURIComponent(returnId)}/refund`, {
    method: 'POST', token: token(), headers: idempotent(key), body, signal,
  })).data;
}

export async function listReturnHolidays(signal?: AbortSignal) {
  return (await apiFetch<ReturnHolidayListResponse['data']>(`${base}/holidays`, { token: token(), signal })).data.items;
}

export async function addReturnHoliday(body: ReturnHolidayCreateRequest, signal?: AbortSignal) {
  return (await apiFetch<ReturnHolidayResponse['data']>(`${base}/holidays`, { method: 'POST', token: token(), body, signal })).data;
}

export async function removeReturnHoliday(id: string, signal?: AbortSignal) {
  await apiFetch<{ id: string }>(`${base}/holidays/${encodeURIComponent(id)}`, { method: 'DELETE', token: token(), signal });
}

export async function readReturnsSettings(signal?: AbortSignal): Promise<ReturnsSettings> {
  return (await apiFetch<ReturnsSettingsResponse['data']>(`${base}/settings`, { token: token(), signal })).data;
}

export async function saveReturnsSettings(body: ReturnsSettingsUpdate, signal?: AbortSignal): Promise<ReturnsSettings> {
  return (await apiFetch<ReturnsSettingsResponse['data']>(`${base}/settings`, { method: 'PUT', token: token(), body, signal })).data;
}
