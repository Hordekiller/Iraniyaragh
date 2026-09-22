import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const cancelOrder: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'number',
    'status',
    'releasedReservations',
    'cancelledAt',
  ],
  properties: {
    id: { type: 'string' },
    number: { type: 'string' },
    status: { type: 'string', enum: ['CANCELLED'] },
    releasedReservations: { type: 'integer', minimum: 0 },
    cancelledAt: { type: 'string', format: 'date-time' },
  },
};

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

export const openApiOrderCommand = {
  cancelResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['order'],
        properties: { order: cancelOrder },
      },
    },
  } satisfies SchemaObject,
  failures: {
    validation: failure(['INVALID_REQUEST'], 400),
    unauthorized: failure(['AUTH_SESSION_INVALID'], 401),
    forbidden: failure(['FORBIDDEN'], 403),
    notFound: failure(['ORDER_NOT_FOUND'], 404),
    conflict: failure(
      ['IDEMPOTENCY_CONFLICT', 'ORDER_STATE_CONFLICT', 'CONFLICT'],
      409,
    ),
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