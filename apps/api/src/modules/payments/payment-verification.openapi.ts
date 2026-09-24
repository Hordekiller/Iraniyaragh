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

const verification: SchemaObject = {
  type: 'object',
  required: [
    'paymentId',
    'status',
    'provider',
    'amount',
    'authority',
    'outcome',
    'orderId',
    'orderStatus',
  ],
  properties: {
    paymentId: { type: 'string' },
    status: { type: 'string', enum: ['PAID', 'PENDING', 'FAILED'] },
    provider: { type: 'string', enum: ['zarinpal'] },
    amount: money,
    authority: { type: 'string' },
    referenceId: { type: 'string', description: 'Gateway settlement reference.' },
    outcome: {
      type: 'string',
      enum: ['VERIFIED', 'REPLAY', 'VERIFIED_AFTER_CANCELLED', 'NOT_PAID', 'ACCEPTED_UNCONFIRMED'],
      description:
        'VERIFIED the provider settled this payment; REPLAY the callback duplicates an already settled/terminal payment; ' +
        'VERIFIED_AFTER_CANCELLED money arrived after the order was closed (reconciliation); ' +
        'NOT_PAID the provider deterministically reported the purchase was not settled; ' +
        'ACCEPTED_UNCONFIRMED the provider answer was ambiguous and was routed to reconciliation, the payment stays PENDING.',
    },
    orderId: { type: 'string' },
    orderStatus: { type: 'string', enum: ['PENDING_PAYMENT', 'PAID', 'CANCELLED'] },
    consumedReservations: { type: 'number', description: 'Reservations consumed into sales.' },
    fulfillmentId: { type: 'string' },
  },
};

export const openApiPaymentVerification = {
  verificationResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['verification'],
        properties: { verification },
      },
    },
  } satisfies SchemaObject,
  failures: {
    validation: failureError(['INVALID_REQUEST'], 400),
    notFound: failureError(['NOT_FOUND'], 404),
    conflict: failureError(['PAYMENT_STATE_CONFLICT', 'ORDER_STATE_CONFLICT', 'CONFLICT'], 409),
    serviceUnavailable: failureError(['UPSTREAM_UNAVAILABLE'], 503),
  },
};
