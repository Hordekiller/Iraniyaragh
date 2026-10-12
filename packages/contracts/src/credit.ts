import type { Money } from './index';

export type CreditAccountStatus = 'ACTIVE' | 'SUSPENDED';
export type ReceivableStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
export type CreditEntryKind = 'OPENING_BALANCE' | 'RECEIPT' | 'RECEIPT_REVERSAL' | 'DEBIT_ADJUSTMENT' | 'CREDIT_NOTE';
export type CreditAccountSummary = {
  id: string; customerId: string; status: CreditAccountStatus; version: number;
  creditLimit: Money; termsDays: number; outstanding: Money; availableCredit: Money;
  overdue: Money; overLimit: boolean; createdAt: string; updatedAt: string;
};
export type CreditDocument = {
  id: string; kind: 'OPENING_BALANCE'; originalAmount: Money; effectivePrincipal: Money;
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
  account: CreditAccountSummary; documentId?: string; receiptId?: string; entryIds?: string[];
};
