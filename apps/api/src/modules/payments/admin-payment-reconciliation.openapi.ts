import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const openApiAdminPaymentReconciliation = {
  response: {
    type: 'object', additionalProperties: false, required: ['data'],
    properties: {
      data: {
        type: 'object', additionalProperties: false, required: ['reconciliation'],
        properties: {
          reconciliation: {
            type: 'object', additionalProperties: false,
            required: ['paymentId', 'status', 'outcome', 'referenceId', 'orderId', 'orderStatus'],
            properties: {
              paymentId: { type: 'string' },
              status: { type: 'string', enum: ['PAID', 'PENDING', 'FAILED'] },
              outcome: { type: 'string', enum: ['VERIFIED', 'REPLAY', 'VERIFIED_AFTER_CANCELLED', 'NOT_PAID', 'ACCEPTED_UNCONFIRMED'] },
              referenceId: { type: 'string', nullable: true },
              orderId: { type: 'string' },
              orderStatus: { type: 'string', enum: ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'CANCELLED', 'RETURNED'] },
            },
          },
        },
      },
    },
  } as SchemaObject,
  failure: {
    type: 'object', required: ['code', 'message', 'requestId', 'statusCode'],
    properties: {
      code: { type: 'string' }, message: { type: 'string' },
      requestId: { type: 'string' }, statusCode: { type: 'integer' },
    },
  } as SchemaObject,
};
