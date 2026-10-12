import type { CreditSaleApprovalRequest, CreditAdjustmentRequest, CreditCommandResult, CreditLedgerPage, CreditOpeningRequest, CreditPolicyRequest, CreditReceiptRequest, CreditReversalRequest, CreditStatement } from '@iranyaragh/contracts';
import { apiFetch } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/token-store';
const base = (customerId: string) => `/credit/admin/customers/${encodeURIComponent(customerId)}`;
export const getCreditStatement = (customerId: string, offset = 0, signal?: AbortSignal) => apiFetch<CreditStatement>(`${base(customerId)}?offset=${offset}&limit=25`, { token: getAccessToken(), signal, responseShape: 'raw' });
export const getCreditLedger = (customerId: string, offset = 0, signal?: AbortSignal) => apiFetch<CreditLedgerPage>(`${base(customerId)}/ledger?offset=${offset}&limit=25`, { token: getAccessToken(), signal, responseShape: 'raw' });
function command(customerId: string, path: string, input: unknown, key: string): Promise<CreditCommandResult> {
  return apiFetch<CreditCommandResult>(`${base(customerId)}${path}`, { method: 'POST', token: getAccessToken(), body: input, headers: { 'Idempotency-Key': key }, responseShape: 'raw' });
}
export const saveCreditPolicy = (id: string, input: CreditPolicyRequest, key: string) => command(id, '/policy', input, key);
export const recordCreditOpening = (id: string, input: CreditOpeningRequest, key: string) => command(id, '/opening', input, key);
export const recordCreditReceipt = (id: string, input: CreditReceiptRequest, key: string) => command(id, '/receipts', input, key);
export const adjustCreditDocument = (id: string, documentId: string, input: CreditAdjustmentRequest, key: string) => command(id, `/documents/${encodeURIComponent(documentId)}/adjust`, input, key);
export const reverseCreditReceipt = (id: string, receiptId: string, input: CreditReversalRequest, key: string) => command(id, `/receipts/${encodeURIComponent(receiptId)}/reverse`, input, key);

export const approveCreditSale = (id: string, orderId: string, input: CreditSaleApprovalRequest, key: string) => command(id, `/orders/${encodeURIComponent(orderId)}/approve`, input, key);
