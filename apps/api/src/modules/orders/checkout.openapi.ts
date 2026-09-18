import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const money: SchemaObject = {
  type: 'object',
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string', pattern: '^[0-9]+$' },
    currency: { type: 'string', enum: ['IRR'] },
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
    postalCode: {
      type: 'string',
      description: 'Ten digits after server normalization.',
    },
    recipient: { type: 'string', maxLength: 120 },
    mobile: {
      type: 'string',
      description: 'Iranian mobile normalized to +989XXXXXXXXX.',
    },
  },
};

const cartLine: SchemaObject = {
  type: 'object',
  required: [
    'variantId',
    'quantity',
    'title',
    'sku',
    'unitPrice',
    'lineTotal',
    'available',
  ],
  properties: {
    variantId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1, maximum: 99 },
    title: { type: 'string' },
    sku: { type: 'string' },
    unitPrice: money,
    lineTotal: money,
    available: { type: 'integer', minimum: 0 },
  },
};

const cart: SchemaObject = {
  type: 'object',
  required: ['id', 'version', 'lines', 'quote', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    version: { type: 'integer', minimum: 1 },
    lines: { type: 'array', items: cartLine },
    quote: {
      type: 'object',
      required: [
        'subtotal',
        'shipping',
        'total',
        'currency',
        'pricePolicyRevision',
        'quotedAt',
      ],
      properties: {
        subtotal: money,
        shipping: money,
        total: money,
        currency: { type: 'string', enum: ['IRR'] },
        pricePolicyRevision: { type: 'string' },
        quotedAt: { type: 'string', format: 'date-time' },
      },
    },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const shippingQuote: SchemaObject = {
  type: 'object',
  required: [
    'quoteId',
    'method',
    'title',
    'amount',
    'policyRevision',
    'pricePolicyRevision',
    'cartVersion',
    'expiresAt',
  ],
  properties: {
    quoteId: { type: 'string' },
    method: { type: 'string' },
    title: { type: 'string' },
    amount: money,
    policyRevision: { type: 'string' },
    pricePolicyRevision: { type: 'string' },
    cartVersion: { type: 'integer', minimum: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
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

export const openApiCheckout = {
  previewBody: {
    type: 'object',
    required: ['address'],
    properties: { address },
  } satisfies SchemaObject,
  createBody: {
    type: 'object',
    required: ['address', 'shippingQuoteId'],
    properties: {
      address,
      shippingQuoteId: { type: 'string', maxLength: 128 },
    },
  } satisfies SchemaObject,
  previewResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['cart', 'shipping'],
        properties: {
          cart,
          shipping: { type: 'array', items: shippingQuote },
        },
      },
    },
  } satisfies SchemaObject,
  createResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['order', 'reservations'],
        properties: {
          order: {
            type: 'object',
            required: [
              'id',
              'number',
              'status',
              'items',
              'subtotal',
              'discount',
              'shipping',
              'total',
              'address',
              'shippingQuote',
              'pricePolicyRevision',
              'reservationExpiresAt',
              'createdAt',
            ],
            properties: {
              id: { type: 'string' },
              number: { type: 'string' },
              status: { type: 'string', enum: ['PENDING_PAYMENT'] },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  required: [
                    'variantId',
                    'productTitle',
                    'variantTitle',
                    'sku',
                    'quantity',
                    'unitPrice',
                    'lineTotal',
                  ],
                  properties: {
                    variantId: { type: 'string' },
                    productTitle: { type: 'string' },
                    variantTitle: { type: 'string', nullable: true },
                    sku: { type: 'string' },
                    quantity: { type: 'integer', minimum: 1, maximum: 99 },
                    unitPrice: money,
                    lineTotal: money,
                  },
                },
              },
              subtotal: money,
              discount: money,
              shipping: money,
              total: money,
              address,
              shippingQuote,
              pricePolicyRevision: { type: 'string' },
              reservationExpiresAt: { type: 'string', format: 'date-time' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          reservations: {
            type: 'array',
            items: {
              type: 'object',
              required: [
                'id',
                'variantId',
                'quantity',
                'expiresAt',
              ],
              properties: {
                id: { type: 'string' },
                variantId: { type: 'string' },
                quantity: { type: 'integer', minimum: 1 },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  } satisfies SchemaObject,
  failures: {
    validation: failure(['INVALID_REQUEST', 'VALIDATION_ERROR'], 400),
    unauthorized: failure(['AUTH_SESSION_INVALID'], 401),
    forbidden: failure(['FORBIDDEN'], 403),
    notFound: failure(['SKU_NOT_FOUND'], 404),
    conflict: failure(
      [
        'CART_EMPTY',
        'QUOTE_CHANGED',
        'SHIPPING_QUOTE_CHANGED',
        'INSUFFICIENT_STOCK',
        'IDEMPOTENCY_CONFLICT',
        'CONFLICT',
      ],
      409,
    ),
    unprocessable: failure(['INVALID_REQUEST'], 422),
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
