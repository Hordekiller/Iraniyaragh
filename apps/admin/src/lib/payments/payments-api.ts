import type {
  AdminPaymentDetailResponse,
  AdminPaymentListResponse,
  PaymentStatus,
} from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';

export type PaymentQuery = {
  page: number;
  perPage: number;
  status?: PaymentStatus;
  search?: string;
};

export async function listPayments(query: PaymentQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(query.page), perPage: String(query.perPage) });
  if (query.status) params.set('status', query.status);
  if (query.search) params.set('search', query.search);
  const response = await apiFetch<AdminPaymentListResponse['data']>(`/payments/admin?${params}`, {
    token: getAccessToken(), signal,
  });
  return response.data;
}

export async function getPayment(id: string, signal?: AbortSignal) {
  const response = await apiFetch<AdminPaymentDetailResponse['data']>(
    `/payments/admin/${encodeURIComponent(id)}`,
    { token: getAccessToken(), signal },
  );
  return response.data.payment;
}
