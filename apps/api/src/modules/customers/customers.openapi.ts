import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const summary: SchemaObject = {
  type: 'object',
  required: ['id', 'mobile', 'firstName', 'lastName', 'status', 'version', 'orderCount', 'hasUserAccount', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    mobile: { type: 'string', description: 'Canonical E.164 Iranian mobile (+989XXXXXXXXX).' },
    firstName: { type: 'string', nullable: true },
    lastName: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    version: { type: 'integer' },
    orderCount: { type: 'integer' },
    hasUserAccount: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const address: SchemaObject = {
  type: 'object',
  required: ['id', 'label', 'receiverName', 'mobile', 'provinceCode', 'city', 'addressLine', 'postalCode', 'isDefault', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' }, label: { type: 'string' }, receiverName: { type: 'string' },
    mobile: { type: 'string' }, provinceCode: { type: 'string' }, city: { type: 'string' },
    addressLine: { type: 'string' }, postalCode: { type: 'string', nullable: true },
    isDefault: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
  },
};

const note: SchemaObject = {
  type: 'object',
  required: ['id', 'visibility', 'body', 'author', 'createdAt'],
  properties: {
    id: { type: 'string' },
    visibility: { type: 'string', enum: ['INTERNAL', 'CUSTOMER_VISIBLE'] },
    body: { type: 'string' },
    author: {
      type: 'object', nullable: true,
      required: ['id', 'displayNameMasked'],
      properties: { id: { type: 'string' }, displayNameMasked: { type: 'string', nullable: true } },
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const order: SchemaObject = {
  type: 'object',
  required: ['id', 'number', 'status', 'grandTotal', 'paymentStatus', 'fulfillmentStatus', 'placedAt'],
  description: 'Order history entry. Deliberately carries no address or contact PII.',
  properties: {
    id: { type: 'string' }, number: { type: 'string' }, status: { type: 'string' },
    grandTotal: {
      type: 'object', required: ['amount', 'currency'],
      properties: { amount: { type: 'string' }, currency: { type: 'string', enum: ['IRR'] } },
    },
    paymentStatus: { type: 'string', nullable: true },
    fulfillmentStatus: { type: 'string', nullable: true },
    placedAt: { type: 'string', format: 'date-time' },
  },
};

const detail: SchemaObject = {
  allOf: [
    summary,
    {
      type: 'object',
      required: ['deactivatedAt', 'addresses', 'notes', 'recentOrders'],
      properties: {
        deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
        addresses: { type: 'array', items: address },
        notes: { type: 'array', items: note },
        recentOrders: { type: 'array', items: order },
      },
    },
  ],
};

const listMeta: SchemaObject = {
  type: 'object',
  required: ['page', 'perPage', 'total', 'pages'],
  properties: {
    page: { type: 'integer' }, perPage: { type: 'integer' }, total: { type: 'integer' }, pages: { type: 'integer' },
  },
};

const envelope = (data: SchemaObject): SchemaObject => ({
  type: 'object', required: ['data'], properties: { data },
});

const account: SchemaObject = {
  type: 'object',
  required: ['id', 'mobile', 'firstName', 'lastName', 'version', 'addresses'],
  properties: {
    id: { type: 'string' }, mobile: { type: 'string' },
    firstName: { type: 'string', nullable: true }, lastName: { type: 'string', nullable: true },
    version: { type: 'integer' }, addresses: { type: 'array', items: address },
  },
};

const addressInput: SchemaObject = {
  type: 'object',
  required: ['label', 'receiverName', 'mobile', 'provinceCode', 'city', 'addressLine'],
  properties: {
    label: { type: 'string', maxLength: 60 }, receiverName: { type: 'string', maxLength: 120 },
    mobile: { type: 'string' }, provinceCode: { type: 'string', maxLength: 32 },
    city: { type: 'string', maxLength: 100 }, addressLine: { type: 'string', maxLength: 400 },
    postalCode: { type: 'string', nullable: true, maxLength: 20 }, isDefault: { type: 'boolean' },
  },
};

export const customersOpenApi = {
  summary,
  detail,
  account: envelope({ type: 'object', required: ['account'], properties: { account } }),
  accountUpdate: {
    type: 'object', required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0 },
      firstName: { type: 'string', nullable: true, maxLength: 100 },
      lastName: { type: 'string', nullable: true, maxLength: 100 },
    },
  } satisfies SchemaObject,
  accountAddresses: {
    type: 'object', required: ['expectedVersion', 'addresses'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0 },
      addresses: { type: 'array', maxItems: 20, items: addressInput },
    },
  } satisfies SchemaObject,
  list: envelope({ type: 'object', required: ['items', 'meta'], properties: { items: { type: 'array', items: summary }, meta: listMeta } }),
  history: envelope({
    type: 'object', required: ['items', 'meta'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object', required: ['id', 'action', 'actorId', 'createdAt'],
          properties: {
            id: { type: 'string' }, action: { type: 'string' },
            actorId: { type: 'string', nullable: true }, createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      meta: listMeta,
    },
  }),
  create: {
    type: 'object', required: ['mobile'],
    properties: {
      mobile: { type: 'string', description: 'Local (09…), 98… or +98… Iranian form; stored as E.164.' },
      firstName: { type: 'string', nullable: true, maxLength: 100 },
      lastName: { type: 'string', nullable: true, maxLength: 100 },
    },
  } satisfies SchemaObject,
  update: {
    type: 'object', required: ['expectedVersion'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0 },
      firstName: { type: 'string', nullable: true, maxLength: 100 },
      lastName: { type: 'string', nullable: true, maxLength: 100 },
    },
  } satisfies SchemaObject,
  addresses: {
    type: 'object', required: ['expectedVersion', 'addresses'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0 },
      addresses: { type: 'array', maxItems: 20, items: address },
      status: {
        type: 'string', enum: ['ACTIVE', 'INACTIVE'],
        description: 'Optional lifecycle change performed in the same audited command.',
      },
    },
  } satisfies SchemaObject,
  note: {
    type: 'object', required: ['expectedVersion', 'visibility', 'body'],
    properties: {
      expectedVersion: { type: 'integer', minimum: 0 },
      visibility: { type: 'string', enum: ['INTERNAL', 'CUSTOMER_VISIBLE'] },
      body: { type: 'string', maxLength: 2000 },
    },
  } satisfies SchemaObject,
};
