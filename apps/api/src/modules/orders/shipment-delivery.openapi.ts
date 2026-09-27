import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureEnvelope } from './order-openapi-schemas';

export const openApiShipmentDelivery = {
  body: { type: 'object', additionalProperties: false, required: ['proofReference'], properties: {
    proofReference: { type: 'string', minLength: 4, maxLength: 100, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$' },
  } } satisfies SchemaObject,
  result: { type: 'object', required: ['data'], properties: {
    data: { type: 'object', required: ['delivery'], properties: {
      delivery: { type: 'object', additionalProperties: false,
        required: ['shipmentId', 'orderId', 'status', 'proofReference', 'confirmedAt'], properties: {
          shipmentId: { type: 'string' }, orderId: { type: 'string' }, status: { type: 'string', enum: ['DELIVERED'] },
          proofReference: { type: 'string' }, confirmedAt: { type: 'string', format: 'date-time' },
        } },
    } },
  } } satisfies SchemaObject,
  error: failureEnvelope,
};
