import type { Money } from './index';

export type CreditAccountStatus = 'ACTIVE' | 'SUSPENDED';
export type ReceivableStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CREDITED';
export type CreditEntryKind = 'SALE' | 'OPENING_BALANCE' | 'RECEIPT' | 'RECEIPT_REVERSAL' | 'DEBIT_ADJUSTMENT' | 'CREDIT_NOTE';
export type CreditAccountSummary = {
  id: string; customerId: string; status: CreditAccountStatus; version: number;
  creditLimit: Money; termsDays: number; outstanding: Money; availableCredit: Money;
  overdue: Money; overLimit: boolean; openingRecorded: boolean; createdAt: string; updatedAt: string;
};
export type CreditDocument = {
  id: string; kind: 'OPENING_BALANCE' | 'SALE'; orderId: string | null; originalAmount: Money; effectivePrincipal: Money;
  outstanding: Money; status: ReceivableStatus; issuedAt: string; dueAt: string; termsDays: number;
};
export type CreditStatement = {
  account: CreditAccountSummary | null; documents: CreditDocument[];
  total: number; offset: number; limit: number;
};
export type CreditLedgerItem = {
  id: string; documentId: string; receiptId: string | null; reversalOfId: string | null;
  kind: CreditEntryKind; amount: Money; effectiveAt: string; createdAt: string;
};
export type CreditLedgerPage = { items: CreditLedgerItem[]; total: number; offset: number; limit: number };
export type CreditPolicyRequest = {
  expectedVersion: number | null; status: CreditAccountStatus; creditLimit: string; termsDays: number;
};
export type CreditOpeningRequest = {
  expectedVersion: number; amount: string; issuedAt: string; dueAt: string; sourceReference: string;
};
export type CreditReceiptRequest = {
  expectedVersion: number; amount: string; method: 'CASH' | 'BANK_TRANSFER';
  effectiveAt: string; evidenceReference: string;
  allocations: { documentId: string; amount: string }[];
};
export type CreditAdjustmentRequest = {
  expectedVersion: number; kind: 'DEBIT_ADJUSTMENT' | 'CREDIT_NOTE'; amount: string;
  effectiveAt: string; evidenceReference: string; reason: string;
};
export type CreditReversalRequest = {
  expectedVersion: number; effectiveAt: string; evidenceReference: string; reason: string;
};
export type CreditCommandResult = {
  account: CreditAccountSummary; order?: { id: string; status: 'CREDIT_APPROVED' | 'CANCELLED' | 'RETURNED'; version: number }; documentId?: string; receiptId?: string; entryIds?: string[]; returnId?: string; payoutId?: string;
};

export type CreditSaleApprovalRequest = { expectedVersion: number; expectedOrderVersion: number };

export type CreditReturnRequest = {
  expectedVersion: number; expectedOrderVersion: number; evidenceReference: string; reason: string;
  lines: { orderItemId: string; quantity: number; warehouseId: string; locationId: string }[];
};
export type CreditCancelRequest = Omit<CreditReturnRequest, 'lines'>;
export type CreditRefundPayoutRequest = {
  expectedVersion: number; amount: string; method: 'CASH' | 'BANK_TRANSFER';
  evidenceReference: string; reason: string; effectiveAt: string;
};
export type CreditSaleReturnView = {
  id: string; orderId: string; kind: 'CANCEL' | 'RETURN'; amount: Money;
  debtCredit: Money; refundDue: Money; refunded: Money; refundRemaining: Money; createdAt: string;
  lines: { orderItemId: string; quantity: number; unitPrice: Money }[];
};
export type CreditSaleReturns = { items: CreditSaleReturnView[] };
