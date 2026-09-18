import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { openApiCartView } from './checkout.openapi';

const failureEnvelope: SchemaObject = {
  type: 'object',
  required: ['code', 'message', 'requestId', 'statusCode'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
    statusCode: { type: 'integer' },
  },
};

const response: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: ['cart'],
      properties: { cart: openApiCartView },
    },
  },
};

export const openApiCart = {
  mutationBody: {
    type: 'object',
    required: ['variantId', 'quantity'],
    properties: {
      variantId: { type: 'string', minLength: 1, maxLength: 191 },
      quantity: { type: 'integer', minimum: 1, maximum: 99 },
    },
  } satisfies SchemaObject,
  response,
  failures: {
    validation: failure(['INVALID_REQUEST', 'VALIDATION_ERROR'], 400),
    unauthorized: failure(['AUTH_SESSION_INVALID'], 401),
    forbidden: failure(['FORBIDDEN'], 403),
    notFound: failure(['SKU_NOT_FOUND'], 404),
    conflict: failure(
      ['CART_LINE_LIMIT_EXCEEDED', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'],
      409,
    ),
    unprocessable: failure(['CART_QUANTITY_INVALID'], 422),
  },
};

function failure(codes: string[], statusCode: number): SchemaObject {
  return {
    ...failureEnvelope,
    properties: {
      ...failureEnvelope.properties,
      code: { type: 'string', enum: codes },
      statusCode: { type: 'integer', enum: [statusCode] },
    },
  };
}
