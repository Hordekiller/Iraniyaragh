import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureEnvelope } from './order-openapi-schemas';

const pick: SchemaObject = {
  type: 'object', additionalProperties: false,
  required: ['id', 'orderItemId', 'quantity', 'actorId', 'requestId', 'createdAt'],
  properties: {
    id: { type: 'string' }, orderItemId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 },
    actorId: { type: 'string', nullable: true }, requestId: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

export const openApiFulfillmentPick = {
  body: {
    type: 'object', additionalProperties: false, required: ['quantity'],
    properties: { quantity: { type: 'integer', minimum: 1 } },
  } satisfies SchemaObject,
  result: {
    type: 'object', required: ['data'], properties: {
      data: { type: 'object', required: ['pick'], properties: { pick } },
    },
  } satisfies SchemaObject,
  list: {
    type: 'object', required: ['data'], properties: {
      data: { type: 'object', required: ['fulfillment', 'items'], properties: {
        fulfillment: { type: 'object', required: ['id', 'status'], properties: {
          id: { type: 'string' }, status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'RETURNED', 'CANCELLED'] },
        } },
        items: { type: 'array', items: { type: 'object', required: ['orderItemId', 'sku', 'productTitle', 'variantTitle', 'quantity', 'pick'], properties: {
          orderItemId: { type: 'string' }, sku: { type: 'string' }, productTitle: { type: 'string' }, variantTitle: { type: 'string', nullable: true },
          quantity: { type: 'integer', minimum: 1 }, pick: { ...pick, nullable: true },
        } } },
      } },
    },
  } satisfies SchemaObject,
  error: failureEnvelope,
};
