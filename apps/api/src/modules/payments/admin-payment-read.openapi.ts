import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PAYMENT_STATUS_VALUES } from './admin-payment-read.dto';

const payment: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'order', 'provider', 'amount', 'status', 'referenceId', 'gatewayEnvironment', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    order: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'number', 'status'],
      properties: {
        id: { type: 'string' },
        number: { type: 'string' },
        status: { type: 'string', enum: ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'RETURNED'] },
      },
    },
    provider: { type: 'string' },
    amount: {
      type: 'object',
      additionalProperties: false,
      required: ['amount', 'currency'],
      properties: {
        amount: { type: 'string', pattern: '^[0-9]+$' },
        currency: { type: 'string', enum: ['IRR'] },
      },
    },
    status: { type: 'string', enum: PAYMENT_STATUS_VALUES },
    referenceId: { type: 'string', nullable: true },
    gatewayEnvironment: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const detail: SchemaObject = {
  ...payment,
  required: [...(payment.required ?? []), 'transitions', 'transitionsTruncated'],
  properties: {
    ...payment.properties,
    transitions: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'reason', 'requestId', 'createdAt'],
        properties: {
          from: { type: 'string', enum: PAYMENT_STATUS_VALUES },
          to: { type: 'string', enum: PAYMENT_STATUS_VALUES },
          reason: { type: 'string', nullable: true },
          requestId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    transitionsTruncated: { type: 'boolean' },
  },
};

const meta: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['page', 'perPage', 'total', 'pages'],
  properties: {
    page: { type: 'integer', minimum: 1 },
    perPage: { type: 'integer', minimum: 1 },
    total: { type: 'integer', minimum: 0 },
    pages: { type: 'integer', minimum: 0 },
  },
};

export const openApiAdminPayments = {
  list: {
    type: 'object', additionalProperties: false, required: ['data'],
    properties: { data: {
      type: 'object', additionalProperties: false, required: ['items', 'meta'],
      properties: { items: { type: 'array', items: payment }, meta },
    } },
  } as SchemaObject,
  detail: {
    type: 'object', additionalProperties: false, required: ['data'],
    properties: { data: {
      type: 'object', additionalProperties: false, required: ['payment'],
      properties: { payment: detail },
    } },
  } as SchemaObject,
  failure: {
    type: 'object', required: ['code', 'message', 'requestId', 'statusCode'],
    properties: {
      code: { type: 'string' }, message: { type: 'string' },
      requestId: { type: 'string' }, statusCode: { type: 'integer' },
    },
  } as SchemaObject,
};
