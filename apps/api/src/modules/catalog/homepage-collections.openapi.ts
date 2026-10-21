import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from '../orders/order-openapi-schemas';

const section: SchemaObject = { type: 'object', additionalProperties: false, required: ['categoryId', 'sortBy'], properties: {
  categoryId: { type: 'string', minLength: 1, maxLength: 128 }, sortBy: { type: 'string', enum: ['NEWEST', 'BESTSELLING'] },
} };
const config: SchemaObject = { type: 'object', required: ['version', 'sections', 'updatedAt'], properties: {
  version: { type: 'integer', minimum: 0 }, sections: { type: 'array', minItems: 5, maxItems: 5, items: section }, updatedAt: { type: 'string', format: 'date-time', nullable: true },
} };
const response: SchemaObject = { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['config'], properties: { config } } } };

export const homepageCollectionsSchemas = {
  body: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'sections'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 }, sections: { type: 'array', minItems: 5, maxItems: 5, items: section },
  } } satisfies SchemaObject,
  response,
  invalid: failureError(['INVALID_REQUEST', 'INVALID_CATEGORY'], 400),
  unauthorized: failureError(['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 401),
  forbidden: failureError(['FORBIDDEN'], 403),
  conflict: failureError(['STALE_VERSION', 'IDEMPOTENCY_CONFLICT'], 409),
};
