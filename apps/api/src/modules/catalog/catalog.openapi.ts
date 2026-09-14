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
  validation: failureSchema('Request body failed schema validation, or the Idempotency-Key header is missing or malformed.', ['INVALID_REQUEST', 'VALIDATION_ERROR'], 'INVALID_REQUEST', 'Request validation failed.', 400),
  unauthorized: failureSchema('Missing, invalid, revoked or expired authentication, or stale fresh-auth window.', ['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 'AUTH_SESSION_INVALID', 'Authentication is required.', 401),
  forbidden: failureSchema('Authenticated but lacking the required permission or authentication level.', ['FORBIDDEN'], 'FORBIDDEN', 'Access denied.', 403),
  notFound: failureSchema('The requested import record does not exist for this actor.', ['NOT_FOUND'], 'NOT_FOUND', 'Catalog import not found.', 404),
  payloadTooLarge: failureSchema('The uploaded workbook exceeds the 10 MiB upload limit.', ['PAYLOAD_TOO_LARGE'], 'PAYLOAD_TOO_LARGE', 'The uploaded workbook is too large.', 413),
  importValidation: failureSchema('The workbook or a committed import contains validation errors and was rejected.', ['IMPORT_VALIDATION', 'ATTRIBUTE_OPTION_INVALID'], 'IMPORT_VALIDATION', 'Catalog import contains validation errors.', 422),
  idempotencyConflict: failureSchema('The Idempotency-Key was already used for a different command, or a domain state conflict occurred.', ['IDEMPOTENCY_CONFLICT', 'CONFLICT', 'STALE_VERSION', 'AXIS_IN_USE', 'DUPLICATE_SKU', 'DUPLICATE_BARCODE', 'DUPLICATE_VARIANT_COMBINATION', 'SKU_CHANGE_NOT_ALLOWED'], 'IDEMPOTENCY_CONFLICT', 'The idempotency key was already used for a different command.', 409),
  invalidReference: failureSchema('A related catalog resource is missing or invalid, or the requested combination cannot be represented.', ['INVALID_REFERENCE', 'ATTRIBUTE_OPTION_INVALID', 'UNPROCESSABLE', 'COMBINATION_LIMIT_EXCEEDED'], 'INVALID_REFERENCE', 'A related catalog resource is invalid.', 422),
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
