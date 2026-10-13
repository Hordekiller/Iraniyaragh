import type { ApiSuccess, InvoiceDocument, Money } from './index';
export type InvoicePublication = {
  documentId: string;
  version: number;
  isPublished: boolean;
  updatedAt: string | null;
};
export type InvoicePublicationRequest = {
  expectedVersion: number;
  isPublished: boolean;
  reason: string;
};
export type InvoicePublicationEvent = InvoicePublication & {
  reason: string;
  actorId: string;
  createdAt: string;
};
export type InvoicePublicationResponse = ApiSuccess<{
  publication: InvoicePublication;
  history: InvoicePublicationEvent[];
  count: number;
  offset: number;
  limit: number;
}>;
export type InvoicePublicationResult = ApiSuccess<{
  publication: InvoicePublication;
  replayed: boolean;
}>;
export type CustomerInvoice = Pick<
  InvoiceDocument,
  | 'id'
  | 'number'
  | 'orderId'
  | 'issuedAt'
  | 'seller'
  | 'buyerLabel'
  | 'address'
  | 'taxPolicy'
> & {
  shippingTitle: string;
  quote: Pick<
    InvoiceDocument['quote'],
    'subtotal' | 'discount' | 'shipping' | 'netAmount' | 'tax' | 'total'
  >;
  lines: Pick<
    InvoiceDocument['lines'][number],
    | 'sku'
    | 'title'
    | 'quantity'
    | 'unitPrice'
    | 'discount'
    | 'netAmount'
    | 'tax'
    | 'total'
  >[];
};
export type CustomerInvoiceSummary = Pick<
  CustomerInvoice,
  'id' | 'number' | 'orderId' | 'issuedAt'
> & { total: Money };
export type CustomerInvoiceResponse = ApiSuccess<{ invoice: CustomerInvoice }>;
export type CustomerInvoiceListResponse = ApiSuccess<{
  items: CustomerInvoiceSummary[];
  count: number;
  offset: number;
  limit: number;
}>;
