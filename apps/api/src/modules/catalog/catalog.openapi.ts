/**
 * Reusable stable failure envelopes for the catalog operations. These mirror the
 * runtime behavior of the global exception filter, the auth guard and the catalog
 * services; see docs/CATALOG_ATTRIBUTES_SPEC.md (error-code matrix) and
 * docs/CATALOG_IDEMPOTENCY.md. The granular codes are additive to API_ERROR_CODES.
 */

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

export const openApiCatalogFailures = {
  validation: {
    ...errorEnvelope,
    description: 'Request body failed schema validation, or the Idempotency-Key header is missing or malformed.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['INVALID_REQUEST', 'VALIDATION_ERROR'], example: 'INVALID_REQUEST' },
      message: { type: 'string', example: 'Request validation failed.' },
      statusCode: { type: 'integer', enum: [400], example: 400 },
    },
  },
  unauthorized: {
    ...errorEnvelope,
    description: 'Missing, invalid, revoked or expired authentication, or stale fresh-auth window.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], example: 'AUTH_SESSION_INVALID' },
      message: { type: 'string', example: 'Authentication is required.' },
      statusCode: { type: 'integer', enum: [401], example: 401 },
    },
  },
  forbidden: {
    ...errorEnvelope,
    description: 'Authenticated but lacking the required permission or authentication level.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['FORBIDDEN'], example: 'FORBIDDEN' },
      message: { type: 'string', example: 'Access denied.' },
      statusCode: { type: 'integer', enum: [403], example: 403 },
    },
  },
  notFound: {
    ...errorEnvelope,
    description: 'The requested import record does not exist for this actor.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['NOT_FOUND'], example: 'NOT_FOUND' },
      message: { type: 'string', example: 'Catalog import not found.' },
      statusCode: { type: 'integer', enum: [404], example: 404 },
    },
  },
  payloadTooLarge: {
    ...errorEnvelope,
    description: 'The uploaded workbook exceeds the 10 MiB upload limit.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['PAYLOAD_TOO_LARGE'], example: 'PAYLOAD_TOO_LARGE' },
      message: { type: 'string', example: 'The uploaded workbook is too large.' },
      statusCode: { type: 'integer', enum: [413], example: 413 },
    },
  },
  importValidation: {
    ...errorEnvelope,
    description: 'The workbook or a committed import contains validation errors and was rejected.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['IMPORT_VALIDATION', 'ATTRIBUTE_OPTION_INVALID'], example: 'IMPORT_VALIDATION' },
      message: { type: 'string', example: 'Catalog import contains validation errors.' },
      statusCode: { type: 'integer', enum: [422], example: 422 },
    },
  },
  idempotencyConflict: {
    ...errorEnvelope,
    description: 'The Idempotency-Key was already used for a different command, or a domain state conflict occurred.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['IDEMPOTENCY_CONFLICT', 'CONFLICT'], example: 'IDEMPOTENCY_CONFLICT' },
      message: { type: 'string', example: 'The idempotency key was already used for a different command.' },
      statusCode: { type: 'integer', enum: [409], example: 409 },
    },
  },
  importUnavailable: {
    ...errorEnvelope,
    description: 'The parsed workbook is no longer available for this import, the key conflicted, or the import state conflicts.',
    properties: {
      ...errorEnvelope.properties,
      code: { type: 'string', enum: ['IMPORT_NOT_AVAILABLE', 'IDEMPOTENCY_CONFLICT', 'CONFLICT', 'SKU_CHANGE_NOT_ALLOWED'], example: 'IMPORT_NOT_AVAILABLE' },
      message: { type: 'string', example: 'The parsed workbook is no longer available; upload it again.' },
      statusCode: { type: 'integer', enum: [409], example: 409 },
    },
  },
};