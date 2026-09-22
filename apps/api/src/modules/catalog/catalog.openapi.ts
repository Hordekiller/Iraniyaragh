/**
 * Reusable stable failure envelopes for the catalog operations. These mirror the
 * runtime behavior of the global exception filter, the auth guard and the catalog
 * services; see docs/CATALOG_ATTRIBUTES_SPEC.md (error-code matrix) and
 * docs/CATALOG_IDEMPOTENCY.md. The granular codes are additive to API_ERROR_CODES.
 */
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const errorEnvelope = {
  type: 'object',
  required: ['code', 'message', 'requestId', 'statusCode'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string', description: 'Request correlation id, echoed from the x-request-id flow.' },
    statusCode: { type: 'integer' },
  },
};

const publicImage: SchemaObject = {
  type: 'object',
  required: ['id', 'kind', 'position', 'role', 'alt', 'caption', 'width', 'height', 'sources'],
  properties: {
    id: { type: 'string' }, kind: { type: 'string', enum: ['IMAGE'] }, position: { type: 'integer', minimum: 0 },
    role: { type: 'string', enum: ['PRIMARY', 'GALLERY', 'VIDEO_POSTER'] }, alt: { type: 'string' },
    caption: { type: 'string', nullable: true }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 },
    sources: { type: 'array', items: { type: 'object', required: ['url', 'width', 'height', 'type'], properties: { url: { type: 'string', format: 'uri' }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, type: { type: 'string' } } } },
  },
};

const publicProductItem: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'slug', 'status', 'brandId', 'categoryId', 'createdAt', 'updatedAt', 'primaryMedia'],
  properties: {
    id: { type: 'string' }, name: { type: 'string' }, slug: { type: 'string' }, status: { type: 'string', enum: ['PUBLISHED'] },
    brandId: { type: 'string', nullable: true }, categoryId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    primaryMedia: { ...publicImage, nullable: true },
    startingPrice: { type: 'object', nullable: true, properties: { amount: { type: 'string' }, currency: { type: 'string', enum: ['IRR'] } } },
  },
};

export const openApiPublicCatalog: { products: SchemaObject; product: SchemaObject } = {
  products: { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['items', 'meta'], properties: { items: { type: 'array', items: publicProductItem }, meta: { type: 'object' } } } } },
  product: { type: 'object', required: ['data'], properties: { data: { type: 'object', required: ['product'], properties: { product: { ...publicProductItem, required: [...(publicProductItem.required ?? []), 'description', 'brand', 'category', 'variants', 'media'], properties: { ...publicProductItem.properties, description: { type: 'string', nullable: true }, brand: { type: 'object', nullable: true }, category: { type: 'object', nullable: true }, variants: { type: 'array', items: { type: 'object' } }, media: { type: 'array', items: publicImage } } } } } } },
};

export const openApiCatalogFailures = {
  validation: failureSchema('Request body failed schema validation, or the Idempotency-Key header is missing or malformed.', ['INVALID_REQUEST', 'VALIDATION_ERROR'], 'INVALID_REQUEST', 'Request validation failed.', 400),
  unauthorized: failureSchema('Missing, invalid, revoked or expired authentication, or stale fresh-auth window.', ['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 'AUTH_SESSION_INVALID', 'Authentication is required.', 401),
  forbidden: failureSchema('Authenticated but lacking the required permission or authentication level.', ['FORBIDDEN'], 'FORBIDDEN', 'Access denied.', 403),
  notFound: failureSchema('The requested import record does not exist for this actor.', ['NOT_FOUND'], 'NOT_FOUND', 'Catalog import not found.', 404),
  payloadTooLarge: failureSchema('The uploaded workbook exceeds the 10 MiB upload limit.', ['PAYLOAD_TOO_LARGE'], 'PAYLOAD_TOO_LARGE', 'The uploaded workbook is too large.', 413),
  importValidation: failureSchema('The workbook or a committed import contains validation errors and was rejected.', ['IMPORT_VALIDATION', 'ATTRIBUTE_OPTION_INVALID'], 'IMPORT_VALIDATION', 'Catalog import contains validation errors.', 422),
  idempotencyConflict: failureSchema('The Idempotency-Key was already used for a different command, or a domain state conflict occurred.', ['IDEMPOTENCY_CONFLICT', 'CONFLICT', 'STALE_VERSION', 'AXIS_IN_USE', 'DUPLICATE_SKU', 'DUPLICATE_BARCODE', 'DUPLICATE_VARIANT_COMBINATION', 'SKU_CHANGE_NOT_ALLOWED'], 'IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different command.', 409),
  invalidReference: failureSchema('A related catalog resource is missing or invalid, or the requested combination cannot be represented.', ['INVALID_REFERENCE', 'ATTRIBUTE_OPTION_INVALID', 'UNPROCESSABLE', 'COMBINATION_LIMIT_EXCEEDED'], 'INVALID_REFERENCE', 'A related catalog resource is invalid.', 422),
  descriptionNotFound: failureSchema('The requested product does not exist.', ['NOT_FOUND'], 'NOT_FOUND', 'Product not found.', 404),
  descriptionConflict: failureSchema('The description version is stale, or the Idempotency-Key was already used for a different command.', ['STALE_VERSION', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'], 'STALE_VERSION', 'version conflict', 409),
  descriptionInvalid: failureSchema('The description references product media that is not a ready image of this product, or exceeds the sanitized content limit.', ['DESCRIPTION_MEDIA_INVALID', 'DESCRIPTION_TOO_LARGE'], 'DESCRIPTION_MEDIA_INVALID', 'A description image references unavailable product media.', 422),
  importUnavailable: failureSchema('The parsed workbook is no longer available for this import, the key conflicted, or the import state conflicts.', ['IMPORT_NOT_AVAILABLE', 'IDEMPOTENCY_CONFLICT', 'CONFLICT', 'SKU_CHANGE_NOT_ALLOWED'], 'IMPORT_NOT_AVAILABLE', 'The parsed workbook is no longer available; upload it again.', 409),
};

function failureSchema(description: string, codes: string[], exampleCode: string, exampleMessage: string, status: number) {
  return {
    ...errorEnvelope,
    description,
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: codes, example: exampleCode },
      message: { type: 'string', example: exampleMessage },
      statusCode: { type: 'integer', enum: [status], example: status },
    },
  };
}
