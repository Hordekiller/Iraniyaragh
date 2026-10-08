import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from './order-openapi-schemas';

const amount: SchemaObject = { type: 'object', additionalProperties: false, required: ['amount', 'currency'], properties: {
  amount: { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$', description: 'Nonnegative integer IRR, at most PostgreSQL signed BIGINT maximum.' }, currency: { type: 'string', enum: ['IRR'] },
} };
const fields = { title: { type: 'string', minLength: 1, maxLength: 120 } as SchemaObject, amount, isActive: { type: 'boolean' } as SchemaObject };
const method: SchemaObject = { type: 'object', required: ['code', 'title', 'amount', 'isActive', 'version', 'policyRevision', 'updatedAt'], properties: {
  ...fields, code: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' }, version: { type: 'integer', minimum: 0 }, policyRevision: { type: 'string' }, updatedAt: { type: 'string', format: 'date-time' },
} };
const response: SchemaObject = { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['method'], properties: { method } } } };
export const shippingSettingsSchemas = {
  body: { type: 'object', additionalProperties: false, required: ['title', 'amount', 'isActive', 'expectedVersion'], properties: { ...fields, expectedVersion: { type: 'integer', minimum: 0, nullable: true, description: 'Null only for a new code; use current version to update.' } } } satisfies SchemaObject,
  response,
  list: { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['items'], properties: { items: { type: 'array', maxItems: 100, items: method } } } } } satisfies SchemaObject,
  unauthorized: failureError(['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 401),
  forbidden: failureError(['FORBIDDEN'], 403), invalid: failureError(['INVALID_REQUEST'], 400),
  conflict: failureError(['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'], 409),
};
