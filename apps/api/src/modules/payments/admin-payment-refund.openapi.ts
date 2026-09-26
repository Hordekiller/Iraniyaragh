import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const money = (description: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['amount', 'currency'],
  description,
  properties: {
    amount: { type: 'string', description: 'Integer Rial, transported as a string.' },
    currency: { type: 'string', enum: ['IRR'] },
  },
});

export const openApiAdminRefund = {
  requestBody: {
    type: 'object',
    additionalProperties: false,
    required: ['amountMinorUnits', 'gatewayReferenceId', 'reason'],
    properties: {
      amountMinorUnits: {
        type: 'string',
        description: 'Positive integer Rial, no leading zeros. Capped server-side by the remaining refundable amount.',
      },
      gatewayReferenceId: {
        type: 'string',
        maxLength: 128,
        description: 'The reference the gateway panel produced for this transfer. Required evidence and unique across refunds.',
      },
      reason: { type: 'string', maxLength: 255, description: 'Bounded operational reason recorded with the transition.' },
      note: { type: 'string', maxLength: 500, description: 'Optional operational context. Never projected to customers.' },
    },
  } as SchemaObject,
  response: {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['refund'],
        properties: {
          refund: {
            type: 'object',
            additionalProperties: false,
            required: [
              'refundId', 'paymentId', 'orderId', 'amount', 'status', 'gatewayReferenceId',
              'reason', 'note', 'paymentStatus', 'refundedTotal', 'remainingRefundable', 'createdAt',
            ],
            properties: {
              refundId: { type: 'string' },
              paymentId: { type: 'string' },
              orderId: { type: 'string' },
              amount: money('Amount returned by this refund.'),
              status: { type: 'string', enum: ['RECORDED'] },
              gatewayReferenceId: { type: 'string' },
              reason: { type: 'string' },
              note: { type: 'string', nullable: true },
              paymentStatus: { type: 'string', enum: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
              refundedTotal: money('Total refunded for this payment after this record.'),
              remainingRefundable: money('Money that may still be returned.'),
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  } as SchemaObject,
  failure: {
    type: 'object',
    required: ['code', 'message', 'requestId', 'statusCode'],
    properties: {
      code: { type: 'string' }, message: { type: 'string' },
      requestId: { type: 'string' }, statusCode: { type: 'integer' },
    },
  } as SchemaObject,
};
