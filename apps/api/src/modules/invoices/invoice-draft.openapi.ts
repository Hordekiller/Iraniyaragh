import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiCreatedResponse, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from '../orders/order-openapi-schemas';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text: SchemaObject = { type: 'string' };
const nullableText: SchemaObject = { ...text, nullable: true };
const integer: SchemaObject = { type: 'integer', minimum: 0 };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const money = object({ amount: { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$' }, currency: { type: 'string', enum: ['IRR'] } });
const components = { subtotal: money, discount: money, netAmount: money, tax: money, total: money };
const quote = object({ ...components, shipping: money, lines: { type: 'array', items: object({ id: text, ...components }) } });
const summary = { id: text, version: integer, state: { type: 'string', enum: ['DRAFT', 'CANCELLED'] } as SchemaObject,
  source: { type: 'string', enum: ['CATALOG', 'ORDER'] } as SchemaObject, customerId: text, buyerLabel: text, sourceOrderId: nullableText, createdAt: date, updatedAt: date };
const address = object({ provinceCode: text, city: text, address: text, postalCode: text, recipient: text, mobile: text });
const draft = object({ ...summary, sourceOrderVersion: { ...integer, nullable: true }, sourceTermsMatch: { type: 'boolean', nullable: true }, address, note: nullableText,
  lines: { type: 'array', minItems: 1, maxItems: 50, items: object({ variantId: text, sku: text, title: text, quantity: { type: 'integer', minimum: 1, maximum: 1000 }, unitPrice: money, discount: money, subtotal: money }) },
  globalDiscount: money, shipping: object({ code: text, title: text, amount: money, policyRevision: text }), pricePolicyRevision: text,
  quoteExpiresAt: { ...date, nullable: true }, policyVersion: { type: 'integer', minimum: 1, nullable: true }, quote: { ...quote, nullable: true },
  quotationStatus: { type: 'string', enum: ['CURRENT', 'POLICY_REQUIRED', 'POLICY_CHANGED', 'PRICE_EXPIRED', 'SOURCE_CHANGED'] } });
const page = (items: SchemaObject) => object({ items: { type: 'array', items }, count: integer, offset: integer, limit: { type: 'integer', minimum: 1, maximum: 100 } });
const schemas = { read: object({ draft }), command: object({ draft, committedVersion: integer, replayed: { type: 'boolean', description: 'Replay returns the current workspace and the originally committed version.' } }),
  list: page(object(summary)), history: page(object({ version: integer, action: { type: 'string', enum: ['CREATED', 'EDITED', 'REQUOTED', 'CANCELLED'] }, actorId: text, createdAt: date })),
  options: object({ items: { type: 'array', items: { type: 'object', properties: { id: text, label: text, detail: text }, required: ['id', 'label'], additionalProperties: false } }, count: integer }) };
export function InvoiceDraftResponses(kind: keyof typeof schemas, created = false) {
  return applyDecorators((created ? ApiCreatedResponse : ApiOkResponse)({ schema: object({ data: schemas[kind] }) }),
    ApiResponse({ status: 400, schema: failureError(['VALIDATION_ERROR','INVALID_REQUEST','IDEMPOTENCY_KEY_REQUIRED'], 400) }),
    ApiResponse({ status: 401, schema: failureError(['AUTH_SESSION_INVALID','AUTH_SESSION_REPLAYED'], 401) }),
    ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) }),
    ApiResponse({ status: 404, schema: failureError(['INVOICE_DRAFT_NOT_FOUND','ORDER_NOT_FOUND','CUSTOMER_NOT_FOUND','SKU_NOT_FOUND'], 404) }),
    ApiResponse({ status: 409, schema: failureError(['STALE_VERSION','IDEMPOTENCY_CONFLICT','INVOICE_REQUOTE_REQUIRED','INVOICE_DRAFT_EXISTS','INVOICE_SOURCE_CHANGED','INVOICE_SOURCE_UNAVAILABLE','INVOICE_SOURCE_UNSUPPORTED','INVOICE_DRAFT_TERMINAL','CUSTOMER_INACTIVE','SKU_NOT_SELLABLE','SHIPPING_UNAVAILABLE','CONFLICT'], 409) }),
    ApiResponse({ status: 422, schema: failureError(['INVALID_REQUEST','PRICE_UNAVAILABLE'], 422) }),
    ApiResponse({ status: 500, schema: failureError(['INVOICE_DRAFT_UNAVAILABLE'], 500) }));
}
