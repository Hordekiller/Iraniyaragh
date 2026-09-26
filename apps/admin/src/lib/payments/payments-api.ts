import type {
  AdminPaymentDetailResponse,
  AdminPaymentListResponse,
  AdminPaymentReconciliationResponse,
  AdminRefundRequest,
  AdminRefundResponse,
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

export async function reconcilePayment(id: string) {
  const response = await apiFetch<AdminPaymentReconciliationResponse['data']>(
    `/payments/admin/${encodeURIComponent(id)}/reconcile`,
    { method: 'POST', token: getAccessToken() },
  );
  return response.data.reconciliation;
}

/**
 * The staff member has already returned the money in the gateway panel; this
 * records that evidence. The key is generated once per form so a retry after a
 * lost response can never record the same transfer twice.
 */
export async function refundPayment(
  id: string,
  request: AdminRefundRequest,
  idempotencyKey: string,
) {
  const response = await apiFetch<AdminRefundResponse['data']>(
    `/payments/admin/${encodeURIComponent(id)}/refund`,
    {
      method: 'POST',
      token: getAccessToken(),
      headers: { 'Idempotency-Key': idempotencyKey },
      body: request,
    },
  );
  return response.data.refund;
}

export function newRefundIdempotencyKey(): string {
  return `refund-${globalThis.crypto.randomUUID()}`;
}
