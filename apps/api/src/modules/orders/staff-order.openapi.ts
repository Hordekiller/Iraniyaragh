import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureError } from './order-openapi-schemas';

const money: SchemaObject = {
  type: 'object',
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string' },
    currency: { type: 'string', enum: ['IRR'] },
  },
};

const line: SchemaObject = {
  type: 'object',
  required: ['variantId', 'quantity'],
  properties: {
    variantId: { type: 'string', maxLength: 64 },
    quantity: { type: 'integer', minimum: 1, maximum: 1000 },
  },
};

const address: SchemaObject = {
  type: 'object',
  required: [
    'provinceCode',
    'city',
    'address',
    'postalCode',
    'recipient',
    'mobile',
  ],
  properties: {
    provinceCode: { type: 'string', maxLength: 32 },
    city: { type: 'string', maxLength: 100 },
    address: { type: 'string', maxLength: 500 },
    postalCode: { type: 'string', maxLength: 32 },
    recipient: { type: 'string', maxLength: 120 },
    mobile: { type: 'string', maxLength: 32 },
  },
};

const money2: SchemaObject = money;

const orderTotals: SchemaObject = {
  type: 'object',
  required: ['subtotal', 'discount', 'shipping', 'grandTotal'],
  properties: {
    subtotal: money2,
    discount: money2,
    shipping: money2,
    grandTotal: money2,
  },
};

const orderSummary: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'number',
    'status',
    'customer',
    'payment',
    'fulfillmentStatus',
    'itemCount',
    'totals',
    'version',
    'reservationExpiresAt',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string' },
    number: { type: 'string' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'RETURNED'],
    },
    customer: {
      type: 'object',
      required: ['id', 'displayNameMasked', 'mobileMasked'],
      properties: {
        id: { type: 'string' },
        displayNameMasked: { type: 'string', nullable: true },
        mobileMasked: { type: 'string' },
      },
    },
    payment: {
      type: 'object',
      required: ['status', 'attemptCount'],
      properties: {
        status: { type: 'string', nullable: true },
        attemptCount: { type: 'integer' },
      },
    },
    fulfillmentStatus: {
      type: 'string',
      nullable: true,
      enum: [
        'PENDING',
        'PROCESSING',
        'READY_TO_SHIP',
        'SHIPPED',
        'DELIVERED',
        'RETURNED',
        'CANCELLED',
      ],
    },
    itemCount: { type: 'integer' },
    totals: orderTotals,
    version: {
      type: 'integer',
      description:
        'Optimistic-concurrency token for later staff commands on this order.',
    },
    reservationExpiresAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const createResponse: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: ['order', 'replayed', 'reservations'],
      properties: {
        replayed: {
          type: 'boolean',
          description:
            'True when the Idempotency-Key matched a previously created order.',
        },
        order: orderSummary,
        reservations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'variantId', 'quantity', 'expiresAt'],
            properties: {
              id: { type: 'string' },
              variantId: { type: 'string' },
              quantity: { type: 'integer' },
              expiresAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  },
};

const optionsResponse: SchemaObject = {
  type: 'object',
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      required: ['items', 'count'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'label', 'detail'],
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              detail: {
                type: 'string',
                nullable: true,
                description:
                  'Masked mobile for a customer; null for a variant.',
              },
            },
          },
        },
        count: { type: 'integer' },
      },
    },
  },
};

export const staffOrderOpenApi = {
  optionsResponse,
  createBody: {
    type: 'object',
    required: ['lines', 'address'],
    properties: {
      customerId: {
        type: 'string',
        maxLength: 64,
        description:
          'Existing staff-managed customer to bill. Omitting it is answered ' +
          'with GUEST_ORDER_UNSUPPORTED, because this slice only creates ' +
          'orders that belong to a customer.',
      },
      lines: { type: 'array', minItems: 1, maxItems: 50, items: line },
      address,
      note: {
        type: 'string',
        maxLength: 500,
        description: 'Operator note stored on the order for staff traceability.',
      },
    },
  } satisfies SchemaObject,
  createResponse,
  totals: money,
  failures: {
    validation: failureError(['INVALID_REQUEST', 'DUPLICATE_LINE'], 400),
    unauthorized: failureError(['AUTH_SESSION_INVALID'], 401),
    forbidden: failureError(['FORBIDDEN'], 403),
    notFound: failureError(['CUSTOMER_NOT_FOUND', 'SKU_NOT_FOUND'], 404),
    conflict: failureError(
      [
        'IDEMPOTENCY_CONFLICT',
        'CUSTOMER_INACTIVE',
        'SKU_NOT_SELLABLE',
        'INSUFFICIENT_STOCK',
        'CONFLICT',
      ],
      409,
    ),
    unprocessable: failureError(
      ['PRICE_UNAVAILABLE', 'GUEST_ORDER_UNSUPPORTED'],
      422,
    ),
  },
};
