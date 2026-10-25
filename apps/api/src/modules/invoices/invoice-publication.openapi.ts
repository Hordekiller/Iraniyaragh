import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const text: SchemaObject = { type: 'string' },
  integer: SchemaObject = { type: 'integer', minimum: 0 },
  date: SchemaObject = { type: 'string', format: 'date-time' };
const money = object({
  amount: { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$' },
  currency: { type: 'string', enum: ['IRR'] },
});
const publication = {
  documentId: text,
  version: integer,
  isPublished: { type: 'boolean' } as SchemaObject,
  updatedAt: { ...date, nullable: true },
};
const summary = {
  id: text,
  number: text,
  orderId: text,
  issuedAt: date,
  total: money,
};
const quote = object({
  subtotal: money,
  discount: money,
  shipping: money,
  netAmount: money,
  tax: money,
  total: money,
});
const customer = object({
  id: text,
  number: text,
  orderId: text,
  issuedAt: date,
  seller: object({ name: text, address: text, contact: text }),
  buyerLabel: text,
  address: object({
    provinceCode: text,
    city: text,
    address: text,
    postalCode: text,
    recipient: text,
    mobile: text,
  }),
  taxPolicy: object({
    treatment: { type: 'string', enum: ['EXCLUSIVE', 'INCLUSIVE', 'EXEMPT'] },
    rateBps: { type: 'integer', minimum: 0, maximum: 10000 },
    exemptionReason: { ...text, nullable: true },
    shippingTaxable: { type: 'boolean' },
  }),
  shippingTitle: text,
  quote,
  lines: {
    type: 'array',
    minItems: 1,
    maxItems: 50,
    items: object({
      sku: text,
      title: text,
      quantity: { type: 'integer', minimum: 1, maximum: 1000 },
      unitPrice: money,
      discount: money,
      netAmount: money,
      tax: money,
      total: money,
    }),
  },
});
export const invoicePublicationOpenApi = {
  admin: object({
    data: object({
      publication: object(publication),
      history: {
        type: 'array',
        maxItems: 100,
        items: object({
          ...publication,
          reason: text,
          actorId: text,
          createdAt: date,
        }),
      },
      count: integer,
      offset: integer,
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  }),
  result: object({
    data: object({
      publication: object(publication),
      replayed: { type: 'boolean' },
    }),
  }),
  customer: object({ data: object({ invoice: customer }) }),
  customerList: object({
    data: object({
      items: { type: 'array', maxItems: 100, items: object(summary) },
      count: integer,
      offset: integer,
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  }),
  pdfRequest: object({
    data: object({
      pdf: object({
        documentId: text,
        status: { type: 'string', enum: ['PENDING', 'READY'] },
        sha256: { ...text, pattern: '^[a-f0-9]{64}$', nullable: true },
        byteCount: { type: 'integer', minimum: 0, nullable: true },
        replayed: { type: 'boolean' },
      }),
    }),
  }),
};
