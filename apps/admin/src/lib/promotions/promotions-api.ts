import type {
  CouponGenerateRequest,
  CouponGenerateResponse,
  CouponListResponse,
  PromotionInput,
  PromotionListResponse,
  PromotionRedemptionListResponse,
  PromotionReportResponse,
  PromotionResponse,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

const base = '/promotions/admin';
const token = () => getAccessToken();
const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
const send = (method: 'POST' | 'PUT', key: string, body: unknown, signal?: AbortSignal) => ({
  method, token: token(), headers: { 'Idempotency-Key': key }, body, signal,
});

export async function listPromotions(query: { q?: string; state?: string; mode?: string; offset: number; limit: number }, signal?: AbortSignal) {
  return (await apiFetch<PromotionListResponse['data']>(`${base}${qs(query)}`, { token: token(), signal })).data;
}
export async function createPromotion(input: PromotionInput, key: string, signal?: AbortSignal) {
  return (await apiFetch<PromotionResponse['data']>(base, send('POST', key, input, signal))).data.promotion;
}
export async function updatePromotion(id: string, promotion: PromotionInput, expectedVersion: number, key: string, signal?: AbortSignal) {
  return (await apiFetch<PromotionResponse['data']>(`${base}/${encodeURIComponent(id)}`, send('PUT', key, { promotion, expectedVersion }, signal))).data.promotion;
}
export async function setPromotionActive(id: string, isActive: boolean, expectedVersion: number, key: string, signal?: AbortSignal) {
  return (await apiFetch<PromotionResponse['data']>(`${base}/${encodeURIComponent(id)}/active`, send('PUT', key, { isActive, expectedVersion }, signal))).data.promotion;
}
export async function listCoupons(promotionId: string, offset: number, limit: number, signal?: AbortSignal) {
  return (await apiFetch<CouponListResponse['data']>(`${base}/coupons/by-promotion/${encodeURIComponent(promotionId)}${qs({ offset, limit })}`, { token: token(), signal })).data;
}
export async function generateCoupons(promotionId: string, body: CouponGenerateRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<CouponGenerateResponse['data']>(`${base}/${encodeURIComponent(promotionId)}/coupons`, send('POST', key, body, signal))).data.items;
}
export async function setCouponActive(couponId: string, isActive: boolean, key: string, signal?: AbortSignal) {
  await apiFetch(`${base}/coupons/${encodeURIComponent(couponId)}/active`, send('PUT', key, { isActive }, signal));
}
export async function listRedemptions(query: { promotionId?: string; customerId?: string; status?: string; offset: number; limit: number }, signal?: AbortSignal) {
  return (await apiFetch<PromotionRedemptionListResponse['data']>(`${base}/redemptions${qs(query)}`, { token: token(), signal })).data;
}
export async function readPromotionReport(signal?: AbortSignal) {
  return (await apiFetch<PromotionReportResponse['data']>(`${base}/report`, { token: token(), signal })).data.items;
}
