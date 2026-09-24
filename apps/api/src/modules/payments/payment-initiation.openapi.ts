import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from '../orders/order-openapi-schemas';

const money: SchemaObject = {
  type: 'object',
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string', description: 'Integer minor units (Rial).' },
    currency: { type: 'string', enum: ['IRR'] },
  },
};

export const paymentInitiation: SchemaObject = {
  type: 'object',
  required: ['paymentId', 'status', 'provider', 'amount', 'authority', 'redirectUrl'],
  properties: {
    paymentId: { type: 'string' },
    status: { type: 'string', enum: ['PENDING'] },
    provider: { type: 'string', enum: ['zarinpal'] },
    amount: money,
    authority: { type: 'string', description: 'Gateway request authority token.' },
    redirectUrl: { type: 'string', format: 'uri', description: 'Server-issued gateway redirect target.' },
  },
};

export const openApiPaymentInitiation = {
  initiationResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['payment'],
        properties: { payment: paymentInitiation },
      },
    },
  } satisfies SchemaObject,
  failures: {
    validation: failureError(['INVALID_REQUEST'], 400),
    unauthorized: failureError(['AUTH_SESSION_INVALID', 'AUTH_REAUTHENTICATION_REQUIRED'], 401),
    forbidden: failureError(['FORBIDDEN'], 403),
    notFound: failureError(['ORDER_NOT_FOUND'], 404),
    conflict: failureError(
      ['IDEMPOTENCY_CONFLICT', 'ORDER_STATE_CONFLICT', 'PAYMENT_STATE_CONFLICT', 'CONFLICT'],
      409,
    ),
    unprocessable: failureError(['UNPROCESSABLE'], 422),
    serviceUnavailable: failureError(
      ['UPSTREAM_UNAVAILABLE', 'PAYMENT_RESULT_UNCONFIRMED'],
      503,
    ),
  },
};