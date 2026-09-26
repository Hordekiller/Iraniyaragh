import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureEnvelope } from './order-openapi-schemas';

export const shipmentSnapshot: SchemaObject = {
  type: 'object', additionalProperties: false,
  required: ['id', 'carrier', 'trackingCode', 'status', 'dispatchedAt'],
  properties: {
    id: { type: 'string' }, carrier: { type: 'string' }, trackingCode: { type: 'string' },
    status: { type: 'string', enum: ['SHIPPED', 'DELIVERED', 'RETURNED'] },
    dispatchedAt: { type: 'string', format: 'date-time' },
  },
};

export const openApiShipmentDispatch = {
  body: { type: 'object', additionalProperties: false, required: ['carrier', 'trackingCode'], properties: {
    carrier: { type: 'string', minLength: 2, maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9 _.-]*$' },
    trackingCode: { type: 'string', minLength: 4, maxLength: 120, pattern: '^[A-Za-z0-9][A-Za-z0-9-]*$' },
  } } satisfies SchemaObject,
  result: { type: 'object', required: ['data'], properties: {
    data: { type: 'object', required: ['shipment'], properties: { shipment: shipmentSnapshot } },
  } } satisfies SchemaObject,
  error: failureEnvelope,
};
