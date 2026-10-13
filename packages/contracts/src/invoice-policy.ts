import type { ApiSuccess, Money } from './index';

export type InvoiceTaxTreatment = 'EXCLUSIVE' | 'INCLUSIVE' | 'EXEMPT';
export type InvoicePolicyFields = {
  sellerName: string;
  sellerAddress: string;
  sellerContact: string;
  taxTreatment: InvoiceTaxTreatment;
  taxRateBps: number;
  exemptionReason: string | null;
  discountCapBps: number;
  shippingTaxable: boolean;
  isActive: boolean;
};
export type InvoicePolicy = InvoicePolicyFields & { id: string; version: number; createdAt: string };
export type InvoicePolicyUpdate = InvoicePolicyFields & { expectedVersion: number | null; reason: string };
export type InvoicePolicyResponse = ApiSuccess<{ policy: InvoicePolicy | null }>;
export type InvoiceQuote = {
  lines: { id: string; subtotal: Money; discount: Money; netAmount: Money; tax: Money; total: Money }[];
  subtotal: Money;
  discount: Money;
  shipping: Money;
  netAmount: Money;
  tax: Money;
  total: Money;
};
