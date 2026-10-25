import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text: SchemaObject = { type: 'string' }; const integer: SchemaObject = { type: 'integer', minimum: 0 };
const date: SchemaObject = { type: 'string', format: 'date-time' }; const nullableText: SchemaObject = { ...text, nullable: true };
const money = object({ amount: { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$' }, currency: { type: 'string', enum: ['IRR'] } });
const components = { subtotal: money, discount: money, netAmount: money, tax: money, total: money };
const quote = object({ ...components, shipping: money, lines: { type: 'array', minItems: 1, maxItems: 50, items: object({ id: text, ...components }) } });
const summary = { id: text, number: text, orderId: text, customerId: text, buyerLabel: text, issuedAt: date };
const document = object({ ...summary, draftId: text, draftVersion: integer, orderVersion: integer, series: { type: 'string', enum: ['SALE'] },
  period: { type: 'integer', minimum: 2000, maximum: 9999 }, sequence: { type: 'integer', minimum: 1, maximum: 999999999 }, policyVersion: { type: 'integer', minimum: 1 },
  seller: object({ name: text, address: text, contact: text }), taxPolicy: object({ treatment: { type: 'string', enum: ['EXCLUSIVE','INCLUSIVE','EXEMPT'] },
    rateBps: { type: 'integer', minimum: 0, maximum: 10000 }, exemptionReason: nullableText, shippingTaxable: { type: 'boolean' } }),
  address: object({ provinceCode: text, city: text, address: text, postalCode: text, recipient: text, mobile: text }), note: nullableText,
  shipping: object({ code: text, title: text, amount: money, policyRevision: text }), pricePolicyRevision: text, quote,
  lines: { type: 'array', minItems: 1, maxItems: 50, items: object({ orderItemId: text, variantId: text, sku: text, title: text,
    quantity: { type: 'integer', minimum: 1, maximum: 1000 }, unitPrice: money, discount: money, netAmount: money, tax: money, total: money }) } });
export const invoiceDocumentOpenApi = {
  read: object({ data: object({ document }) }),
  issue: object({ data: object({ document, committedVersion: integer, replayed: { type: 'boolean', description: 'Returns the original immutable issued document on replay.' } }) }),
  list: object({ data: object({ items: { type: 'array', maxItems: 100, items: object({ ...summary, total: money }) }, count: integer, offset: integer,
    limit: { type: 'integer', minimum: 1, maximum: 100 } }) }),
  pdfRequest: object({ data: object({ pdf: object({
    documentId: text,
    status: { type: 'string', enum: ['PENDING', 'READY'] },
    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$', nullable: true },
    byteCount: { type: 'integer', minimum: 0, nullable: true },
    replayed: { type: 'boolean' } }) }) }),
};
