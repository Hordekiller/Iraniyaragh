import type { ApiSuccess, CheckoutAddress, InvoiceQuote, InvoiceTaxTreatment, Money } from './index';
export type InvoiceIssueRequest = { expectedVersion: number; expectedOrderVersion: number };
export type InvoiceDocument = {
  id: string; draftId: string; draftVersion: number; orderId: string; orderVersion: number;
  customerId: string; number: string; series: 'SALE'; period: number; sequence: number;
  issuedAt: string; policyVersion: number;
  seller: { name: string; address: string; contact: string };
  taxPolicy: { treatment: InvoiceTaxTreatment; rateBps: number; exemptionReason: string | null; shippingTaxable: boolean };
  buyerLabel: string; address: CheckoutAddress; note: string | null;
  shipping: { code: string; title: string; amount: Money; policyRevision: string };
  pricePolicyRevision: string; quote: InvoiceQuote;
  lines: { orderItemId: string; variantId: string; sku: string; title: string; quantity: number; unitPrice: Money;
    discount: Money; netAmount: Money; tax: Money; total: Money }[];
};
export type InvoiceDocumentSummary = Pick<InvoiceDocument, 'id' | 'number' | 'orderId' | 'customerId' | 'buyerLabel' | 'issuedAt'> & { total: Money };
export type InvoiceDocumentResponse = ApiSuccess<{ document: InvoiceDocument }>;
export type InvoiceDocumentListResponse = ApiSuccess<{ items: InvoiceDocumentSummary[]; count: number; offset: number; limit: number }>;
export type InvoiceIssueResult = ApiSuccess<{ document: InvoiceDocument; committedVersion: number; replayed: boolean }>;
