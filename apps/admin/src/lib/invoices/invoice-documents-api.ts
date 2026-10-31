import { createDiagnosticId, diagnosticId, logClientFailure } from '@iranyaragh/contracts';
import type { InvoiceDocumentListResponse, InvoiceDocumentResponse, InvoiceIssueRequest, InvoiceIssueResult } from '@iranyaragh/contracts';
import type { InvoicePublicationRequest, InvoicePublicationResponse, InvoicePublicationResult } from '@iranyaragh/contracts';
import type { InvoicePdfRequestResponse } from '@iranyaragh/contracts';
import { apiFetch, getApiBaseUrl, ApiClientError, ApiNetworkError, ApiAbortError } from '@/lib/api/client';
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
  const requestId = createDiagnosticId();
  let returnedId = requestId;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/v1${root}/documents/${encodeURIComponent(id)}/pdf/artifact`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Request-ID': requestId }, signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
    });
    returnedId = diagnosticId(response.headers.get('x-request-id')) ?? requestId;
    if (!response.ok) {
      const body = await response.json().catch(() => null) as Record<string, unknown> | null;
      const failure = new ApiClientError({ code: typeof body?.code === 'string' ? body.code : 'INTERNAL_ERROR', message: typeof body?.message === 'string' ? body.message : 'دریافت فایل ناموفق بود.', requestId: diagnosticId(body?.requestId) ?? returnedId, statusCode: response.status }, response.headers);
      logClientFailure('admin', failure.requestId, 'http', response.status);
      throw failure;
    }
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const filename = /filename="([^"]+)"/u.exec(disposition)?.[1] ?? 'store-invoice.pdf';
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, sha256: response.headers.get('X-Content-SHA256') ?? null, byteCount: bytes.byteLength, filename };
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (signal?.aborted) throw new ApiAbortError();
    const kind = controller.signal.aborted ? 'timeout' : 'network';
    logClientFailure('admin', returnedId, kind);
    throw new ApiNetworkError('دریافت فایل از سامانه ناموفق بود.', returnedId, kind);
  } finally { clearTimeout(timer); }
}
