import type { InvoiceDocumentListResponse, InvoiceDocumentResponse, InvoiceIssueRequest, InvoiceIssueResult } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
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
