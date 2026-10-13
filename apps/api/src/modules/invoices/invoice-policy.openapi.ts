import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from '../orders/order-openapi-schemas';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({ type: 'object', additionalProperties: false, properties, required: Object.keys(properties) });
const text = (maximum: number): SchemaObject => ({ type: 'string', minLength: 1, maxLength: maximum, description: 'Bounded plain text without markup/control characters.' });
const bps: SchemaObject = { type: 'integer', minimum: 0, maximum: 10000, description: 'Integer basis points; 100 basis points = 1 percent. Operator-approved, no inferred default.' };
const fields = { sellerName: text(200), sellerAddress: text(1000), sellerContact: text(200), taxTreatment: { type: 'string', enum: ['EXCLUSIVE', 'INCLUSIVE', 'EXEMPT'] } as SchemaObject,
  taxRateBps: bps, exemptionReason: { ...text(500), nullable: true, description: 'Required only for EXEMPT; exempt rate must be zero.' }, discountCapBps: bps,
  shippingTaxable: { type: 'boolean' } as SchemaObject, isActive: { type: 'boolean' } as SchemaObject };
const policy = object({ ...fields, id: { type: 'string' }, version: { type: 'integer', minimum: 1 }, createdAt: { type: 'string', format: 'date-time' } });
export const invoicePolicySchemas = {
  body: object({ ...fields, expectedVersion: { type: 'integer', nullable: true, minimum: 1, maximum: 2147483646, description: 'Null only before the first policy; use latest version otherwise.' }, reason: text(500) }),
  response: object({ data: object({ policy: { ...policy, nullable: true } }) }),
  unauthorized: failureError(['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 401), forbidden: failureError(['FORBIDDEN'], 403),
  invalid: failureError(['VALIDATION_ERROR'], 400), conflict: failureError(['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'], 409),
  unavailable: failureError(['INVOICE_POLICY_UNAVAILABLE'], 500),
};
