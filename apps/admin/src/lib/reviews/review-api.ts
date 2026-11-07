import type {
  AdminReviewListResponse, AdminReviewResponse, ProductReviewStatus, ReviewModerationRequest, ReviewReplyRequest,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export const newReviewCommandKey = (command: string) => `review-${command}-${globalThis.crypto.randomUUID()}`;

export async function listReviews(query: { page: number; status?: ProductReviewStatus; q?: string; rating?: number }, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.status) params.set('status', query.status);
  if (query.q) params.set('q', query.q);
  if (query.rating) params.set('rating', String(query.rating));
  return (await apiFetch<AdminReviewListResponse['data']>(`/reviews/admin?${params}`, { token: getAccessToken(), signal })).data;
}
export async function moderateReview(id: string, request: ReviewModerationRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<AdminReviewResponse['data']>(`/reviews/admin/${encodeURIComponent(id)}/moderate`, { token: getAccessToken(), signal, method: 'POST', body: request, headers: { 'Idempotency-Key': key } })).data.review;
}
export async function replyToReview(id: string, request: ReviewReplyRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<AdminReviewResponse['data']>(`/reviews/admin/${encodeURIComponent(id)}/reply`, { token: getAccessToken(), signal, method: 'POST', body: request, headers: { 'Idempotency-Key': key } })).data.review;
}
