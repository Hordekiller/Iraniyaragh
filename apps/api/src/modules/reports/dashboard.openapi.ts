import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import {
  FULFILLMENT_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  RESERVATION_STATUS_VALUES,
  TRANSFER_STATUS_VALUES,
} from './dashboard.dto';

const count: SchemaObject = { type: 'integer', minimum: 0 };

const money: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'string', pattern: '^[0-9]+$' },
    currency: { type: 'string', enum: ['IRR'] },
  },
};

const statusCounts = (statuses: string[]): SchemaObject => ({
  type: 'array',
  minItems: statuses.length,
  maxItems: statuses.length,
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'count'],
    properties: {
      status: { type: 'string', enum: statuses },
      count,
    },
  },
});

const summaryResponse: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['summary'],
      properties: {
        summary: {
          type: 'object',
          additionalProperties: false,
          required: [
            'generatedAt',
            'presentationTimezone',
            'range',
            'rangeMetrics',
            'commerceSnapshot',
            'inventorySnapshot',
          ],
          properties: {
            generatedAt: { type: 'string', format: 'date-time' },
            presentationTimezone: { type: 'string', enum: ['Asia/Tehran'] },
            range: {
              type: 'object',
              additionalProperties: false,
              required: ['createdFrom', 'createdToExclusive'],
              properties: {
                createdFrom: { type: 'string', format: 'date-time' },
                createdToExclusive: { type: 'string', format: 'date-time' },
              },
            },
            rangeMetrics: {
              type: 'object',
              additionalProperties: false,
              required: ['ordersCreated', 'grossOrderValue'],
              properties: { ordersCreated: count, grossOrderValue: money },
            },
            commerceSnapshot: {
              type: 'object',
              additionalProperties: false,
              required: [
                'ordersByStatus',
                'paymentAttemptsByStatus',
                'fulfillmentsByStatus',
                'ordersWithoutPaymentAttempts',
                'ordersWithoutFulfillment',
              ],
              properties: {
                ordersByStatus: statusCounts(ORDER_STATUS_VALUES),
                paymentAttemptsByStatus: statusCounts(PAYMENT_STATUS_VALUES),
                fulfillmentsByStatus: statusCounts(FULFILLMENT_STATUS_VALUES),
                ordersWithoutPaymentAttempts: count,
                ordersWithoutFulfillment: count,
              },
            },
            inventorySnapshot: {
              type: 'object',
              additionalProperties: false,
              required: [
                'zeroAvailableBalances',
                'activeReservations',
                'reservationsByStatus',
                'transfersByStatus',
              ],
              properties: {
                zeroAvailableBalances: count,
                activeReservations: count,
                reservationsByStatus: statusCounts(RESERVATION_STATUS_VALUES),
                transfersByStatus: statusCounts(TRANSFER_STATUS_VALUES),
              },
            },
          },
        },
      },
    },
  },
};

const failure = (
  description: string,
): SchemaObject & { description: string } => ({
  type: 'object',
  description,
  additionalProperties: true,
  required: ['code', 'message', 'requestId', 'statusCode'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    requestId: { type: 'string' },
    statusCode: { type: 'integer' },
  },
});

export const openApiDashboard = {
  summaryResponse,
  failures: {
    validation: failure(
      'The required dashboard range is invalid or exceeds 90 days.',
    ),
    unauthorized: failure('A valid live staff access token is required.'),
    forbidden: failure('The reports.read permission is missing.'),
  },
} as const;
