import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { failureEnvelope } from '../orders/order-openapi-schemas';

const money = { type: 'object', additionalProperties: false, required: ['amount', 'currency'], properties: { amount: { type: 'string' }, currency: { type: 'string', enum: ['IRR'] } } } satisfies SchemaObject;
const windowKind = { type: 'string', enum: ['IN_PERSON', 'DELIVERY'] } satisfies SchemaObject;
const disposition = { type: 'string', enum: ['RESTOCK', 'DAMAGED', 'NOT_RETURNED'] } satisfies SchemaObject;

const returnView = {
  type: 'object', additionalProperties: false,
  required: ['id', 'orderId', 'orderNumber', 'number', 'sequence', 'windowKind', 'policyRevision', 'invoiceIssuedAt', 'deadlineAt', 'returnedAt',
    'merchandiseRefund', 'shippingRefund', 'refundDue', 'refunded', 'refundRemaining', 'reason', 'note', 'lines', 'createdAt'],
  properties: {
    id: { type: 'string' }, orderId: { type: 'string' }, orderNumber: { type: 'string' }, number: { type: 'string' }, sequence: { type: 'integer' },
    windowKind, policyRevision: { type: 'string' },
    invoiceIssuedAt: { type: 'string', format: 'date-time' }, deadlineAt: { type: 'string', format: 'date-time' }, returnedAt: { type: 'string', format: 'date-time' },
    merchandiseRefund: money, shippingRefund: money, refundDue: money, refunded: money, refundRemaining: money,
    reason: { type: 'string' }, note: { type: 'string', nullable: true },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['orderItemId', 'sku', 'title', 'quantity', 'disposition', 'unitPrice', 'refundAmount', 'movementId'],
      properties: {
        orderItemId: { type: 'string' }, sku: { type: 'string' }, title: { type: 'string' }, quantity: { type: 'integer' }, disposition,
        unitPrice: money, refundAmount: money, movementId: { type: 'string', nullable: true },
      } } },
    createdAt: { type: 'string', format: 'date-time' },
  },
} satisfies SchemaObject;

const wrap = (data: SchemaObject): SchemaObject => ({ type: 'object', required: ['data'], properties: { data } });

const settingsView = { type: 'object', additionalProperties: false, required: ['enabled', 'version', 'updatedAt'], properties: {
  enabled: { type: 'boolean' }, version: { type: 'integer', minimum: 0 }, updatedAt: { type: 'string', format: 'date-time', nullable: true },
} } satisfies SchemaObject;

export const openApiReturns = {
  error: failureEnvelope,
  settingsResult: wrap(settingsView),
  settingsBody: { type: 'object', additionalProperties: false, required: ['expectedVersion', 'enabled'], properties: {
    expectedVersion: { type: 'integer', minimum: 0, description: 'Current version; 0 when the switch has never been saved.' }, enabled: { type: 'boolean' },
  } } satisfies SchemaObject,
  publicConfig: wrap({ type: 'object', additionalProperties: false, required: ['enabled'], properties: { enabled: { type: 'boolean' } } }),
  eligibility: wrap({
    type: 'object', required: ['orderId', 'orderNumber', 'eligible', 'reason', 'windowKind', 'policyRevision', 'invoiceIssuedAt', 'deadlineAt', 'lines', 'shippingAmount'],
    properties: {
      orderId: { type: 'string' }, orderNumber: { type: 'string' }, eligible: { type: 'boolean' },
      reason: { type: 'string', nullable: true, enum: ['ORDER_NOT_PAID', 'PAYMENT_NOT_SETTLED', 'CUSTOM_DOOR_EXCLUDED', 'NO_ISSUED_INVOICE', 'METHOD_UNCLASSIFIED', 'WINDOW_CLOSED', 'FULLY_RETURNED', 'AMOUNTS_DO_NOT_RECONCILE'] },
      windowKind: { ...windowKind, nullable: true }, policyRevision: { type: 'string' },
      invoiceIssuedAt: { type: 'string', format: 'date-time', nullable: true }, deadlineAt: { type: 'string', format: 'date-time', nullable: true },
      lines: { type: 'array', items: { type: 'object', required: ['orderItemId', 'sku', 'title', 'orderedQuantity', 'returnedQuantity', 'remainingQuantity', 'unitPrice', 'netLineAmount'],
        properties: { orderItemId: { type: 'string' }, sku: { type: 'string' }, title: { type: 'string' }, orderedQuantity: { type: 'integer' },
          returnedQuantity: { type: 'integer' }, remainingQuantity: { type: 'integer' }, unitPrice: money, netLineAmount: money } } },
      shippingAmount: money,
    },
  }),
  createBody: { type: 'object', additionalProperties: false, required: ['reason', 'lines'], properties: {
    reason: { type: 'string', minLength: 1, maxLength: 500 }, note: { type: 'string', maxLength: 500 },
    lines: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'object', additionalProperties: false, required: ['orderItemId', 'quantity', 'disposition'], properties: {
      orderItemId: { type: 'string' }, quantity: { type: 'integer', minimum: 1 }, disposition,
      warehouseId: { type: 'string', description: 'Required for RESTOCK, forbidden otherwise.' }, locationId: { type: 'string', description: 'Required for RESTOCK, forbidden otherwise.' },
    } } },
  } } satisfies SchemaObject,
  returnResult: wrap(returnView),
  listResult: wrap({ type: 'object', required: ['items', 'meta'], properties: {
    items: { type: 'array', items: returnView },
    meta: { type: 'object', required: ['page', 'perPage', 'total', 'pages'], properties: { page: { type: 'integer' }, perPage: { type: 'integer' }, total: { type: 'integer' }, pages: { type: 'integer' } } },
  } }),
  refundResult: wrap({ type: 'object', required: ['orderReturn', 'refundId', 'paymentStatus'], properties: {
    orderReturn: returnView, refundId: { type: 'string' }, paymentStatus: { type: 'string', enum: ['PARTIALLY_REFUNDED', 'REFUNDED'] },
  } }),
  holiday: { type: 'object', additionalProperties: false, required: ['id', 'dateKey', 'label', 'createdAt'], properties: {
    id: { type: 'string' }, dateKey: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, label: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' },
  } } satisfies SchemaObject,
  holidayBody: { type: 'object', additionalProperties: false, required: ['dateKey', 'label'], properties: {
    dateKey: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Tehran calendar date.' }, label: { type: 'string', minLength: 1, maxLength: 120 },
  } } satisfies SchemaObject,
  holidayList: wrap({ type: 'object', required: ['items'], properties: { items: { type: 'array', items: { type: 'object', required: ['id', 'dateKey', 'label', 'createdAt'], properties: {
    id: { type: 'string' }, dateKey: { type: 'string' }, label: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } } } } } }),
  holidayDeleted: wrap({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }),
};
