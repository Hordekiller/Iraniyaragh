import type { InvoiceDocumentListResponse, InvoiceDocumentResponse, InvoiceIssueRequest, InvoiceIssueResult } from '@iranyaragh/contracts';
import type { InvoicePublicationRequest, InvoicePublicationResponse, InvoicePublicationResult } from '@iranyaragh/contracts';
import type { InvoicePdfRequestResponse } from '@iranyaragh/contracts';
import { apiFetch, getApiBaseUrl, ApiClientError } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
const root = '/invoices/admin';
export async function listInvoiceDocuments(offset = 0, signal?: AbortSignal) {
  return (await apiFetch<InvoiceDocumentListResponse['data']>(`${root}/documents?offset=${offset}&limit=25`, { token: getAccessToken(), signal })).data;
}
export async function readInvoiceDocument(id: string, signal?: AbortSignal) {
  return (await apiFetch<InvoiceDocumentResponse['data']>(`${root}/documents/${encodeURIComponent(id)}`, { token: getAccessToken(), signal })).data.document;
}
export async function documentFromDraft(id: string, signal?: AbortSignal) {
  return (await apiFetch<InvoiceDocumentResponse['data']>(`${root}/drafts/${encodeURIComponent(id)}/document`, { token: getAccessToken(), signal })).data.document;
}
export async function issueInvoiceDocument(id: string, body: InvoiceIssueRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<InvoiceIssueResult['data']>(`${root}/drafts/${encodeURIComponent(id)}/issue`, { method: 'POST', body, headers: { 'Idempotency-Key': key }, token: getAccessToken(), signal })).data;
}
export async function readInvoicePublication(id: string, offset = 0, signal?: AbortSignal) {
  return (await apiFetch<InvoicePublicationResponse['data']>(`${root}/documents/${encodeURIComponent(id)}/publication?offset=${offset}&limit=25`, { token: getAccessToken(), signal })).data;
}
export async function changeInvoicePublication(id: string, body: InvoicePublicationRequest, key: string, signal?: AbortSignal) {
  return (await apiFetch<InvoicePublicationResult['data']>(`${root}/documents/${encodeURIComponent(id)}/publication`, { method: 'PUT', body, headers: { 'Idempotency-Key': key }, token: getAccessToken(), signal })).data;
}
export async function requestInvoicePdf(id: string, key: string, signal?: AbortSignal) {
  return (await apiFetch<InvoicePdfRequestResponse['data']>(`${root}/documents/${encodeURIComponent(id)}/pdf`, { method: 'POST', headers: { 'Idempotency-Key': key }, token: getAccessToken(), signal })).data.pdf;
}
export async function invoicePdfStatus(id: string, signal?: AbortSignal) {
  return (await apiFetch<InvoicePdfRequestResponse['data']>(`${root}/documents/${encodeURIComponent(id)}/pdf`, { token: getAccessToken(), signal })).data.pdf;
}

/** The private artifact is verified bytes, never a JSON envelope. */
export async function downloadInvoicePdfArtifact(id: string, signal?: AbortSignal) {
  const token = getAccessToken();
  if (!token) throw new ApiClientError({ code: 'AUTH_SESSION_INVALID', message: 'نشست معتبر نیست.', requestId: '', statusCode: 401 });
  const response = await fetch(`${getApiBaseUrl()}/api/v1${root}/documents/${encodeURIComponent(id)}/pdf/artifact`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (!response.ok) {
    let payload: unknown;
    try { payload = await response.json(); } catch { payload = undefined; }
    throw new ApiClientError((payload ?? { code: 'INTERNAL_ERROR', message: '', requestId: '', statusCode: response.status }) as never, response.headers);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="([^"]+)"/u.exec(disposition)?.[1] ?? 'store-invoice.pdf';
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, sha256: response.headers.get('X-Content-SHA256') ?? null, byteCount: bytes.byteLength, filename };
}
