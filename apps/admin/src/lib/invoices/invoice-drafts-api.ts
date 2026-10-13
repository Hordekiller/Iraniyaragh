import type { InvoiceDraftCreate, InvoiceDraftEdit, InvoiceDraftFromOrder, InvoiceDraftHistoryResponse, InvoiceDraftListResponse, InvoiceDraftResponse, InvoiceDraftResult, StaffOrderOptionsResponse } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
const path = '/invoices/admin/drafts';
const token = () => getAccessToken();
export async function listInvoiceDrafts(offset = 0, signal?: AbortSignal) { return (await apiFetch<InvoiceDraftListResponse['data']>(`${path}?offset=${offset}&limit=25`, { token: token(), signal })).data; }
export async function readInvoiceDraft(id: string, signal?: AbortSignal) { return (await apiFetch<InvoiceDraftResponse['data']>(`${path}/${encodeURIComponent(id)}`, { token: token(), signal })).data.draft; }
export async function invoiceDraftHistory(id: string, offset = 0, signal?: AbortSignal) { return (await apiFetch<InvoiceDraftHistoryResponse['data']>(`${path}/${encodeURIComponent(id)}/history?offset=${offset}&limit=25`, { token: token(), signal })).data; }
export async function searchInvoiceOptions({ kind, search = '', signal }: { kind: 'customer' | 'variant' | 'shipping'; search?: string; signal?: AbortSignal }) {
  return (await apiFetch<StaffOrderOptionsResponse['data']>(`${path}/options?kind=${kind}&search=${encodeURIComponent(search)}&limit=25`, { token: token(), signal })).data;
}
export type DraftCommand = { kind: 'create'; body: InvoiceDraftCreate } | { kind: 'edit'; id: string; body: InvoiceDraftEdit } |
  { kind: 'requote'; id: string; body: { expectedVersion: number } } | { kind: 'cancel'; id: string; body: { expectedVersion: number; reason: string } } |
  { kind: 'fromOrder'; id: string; body: InvoiceDraftFromOrder };
export async function executeInvoiceDraft(command: DraftCommand, key: string, signal?: AbortSignal) {
  const target = command.kind === 'create' ? path : command.kind === 'fromOrder' ? `${path}/from-order/${encodeURIComponent(command.id)}` :
    `${path}/${encodeURIComponent(command.id)}${command.kind === 'edit' ? '' : `/${command.kind}`}`;
  return (await apiFetch<InvoiceDraftResult['data']>(target, { method: command.kind === 'edit' ? 'PUT' : 'POST', body: command.body,
    token: token(), headers: { 'Idempotency-Key': key }, signal })).data;
}
