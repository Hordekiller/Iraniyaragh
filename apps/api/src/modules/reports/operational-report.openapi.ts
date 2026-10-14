import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { ORDER_STATUS_VALUES, PAYMENT_STATUS_VALUES } from './dashboard.dto';
const text: SchemaObject = { type: 'string' },
  integer: SchemaObject = { type: 'integer', minimum: 0 },
  instant: SchemaObject = { type: 'string', format: 'date-time' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const object = (
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
});
const array = (items: SchemaObject, maxItems?: number): SchemaObject => ({
  type: 'array',
  items,
  ...(maxItems ? { maxItems } : {}),
});
const money = object({
  amount: { type: 'string', pattern: '^-?(0|[1-9][0-9]*)$' },
  currency: { type: 'string', enum: ['IRR'] },
});
const metricNames = [
  'createdOrderValue',
  'providerSettlements',
  'recordedGatewayRefunds',
  'netRecordedCreditReceipts',
  'recordedCreditRefundPayouts',
  'issuedInvoiceValue',
];
const value = object({ count: integer, amount: money });
const filters = object(
  {
    from: instant,
    toExclusive: instant,
    grain: { type: 'string', enum: ['day', 'week', 'month'] },
    customerId: text,
    productId: text,
    status: { type: 'string', enum: ORDER_STATUS_VALUES },
  },
  ['from', 'toExclusive', 'grain'],
);
const envelope = (data: SchemaObject) => object({ data });
const row = object({
  id: text,
  number: text,
  customerId: text,
  status: { type: 'string', enum: ORDER_STATUS_VALUES },
  createdAt: instant,
  total: money,
  paymentAttempts: integer,
  providerSettled: money,
  gatewayRefunded: money,
  issuedInvoiceNumber: nullable(text),
});
const debtor = object({
  customerId: text,
  accountId: text,
  accountStatus: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] },
  documents: integer,
  outstanding: money,
  notDue: money,
  overdueUpTo30Days: money,
  overdue31To60Days: money,
  overdue61To90Days: money,
  overdueOver90Days: money,
  refundObligation: money,
});
export const operationalOpenApi = {
  options: envelope(
    object({ items: array(object({ id: text, label: text }), 25) }),
  ),
  summary: envelope(
    object({
      report: object({
        generatedAt: instant,
        timezone: { type: 'string', enum: ['Asia/Tehran'] },
        filters,
        productFilterScope: {
          type: 'string',
          enum: ['ORDERS_CONTAINING_PRODUCT'],
        },
        totals: object(
          Object.fromEntries(metricNames.map((key) => [key, value])),
        ),
        timeline: array(
          object({
            period: { type: 'string', format: 'date' },
            metric: { type: 'string', enum: metricNames },
            environment: nullable(text),
            count: integer,
            amount: money,
          }),
          5000,
        ),
        orderStatuses: array(
          object({
            status: { type: 'string', enum: ORDER_STATUS_VALUES },
            count: integer,
            amount: money,
          }),
          ORDER_STATUS_VALUES.length,
        ),
        paymentAttemptStatuses: array(
          object({
            status: { type: 'string', enum: PAYMENT_STATUS_VALUES },
            count: integer,
            amount: money,
          }),
          PAYMENT_STATUS_VALUES.length,
        ),
        topItems: array(
          object({
            sku: text,
            title: text,
            quantity: integer,
            grossValue: money,
          }),
          30,
        ),
        unavailable: array(
          {
            type: 'string',
            enum: [
              'CORRECTIVE_INVOICE_DOCUMENTS',
              'AUTHORITATIVE_INVENTORY_VALUATION',
              'PDF_AND_QUEUED_EXPORTS',
            ],
          },
          3,
        ),
      }),
    }),
  ),
  orders: envelope(
    object({
      generatedAt: instant,
      items: array(row, 100),
      count: integer,
      offset: { type: 'integer', minimum: 0, maximum: 1000000 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  ),
  debtors: envelope(
    object({
      generatedAt: instant,
      asOf: instant,
      items: array(debtor, 100),
      count: integer,
      offset: { type: 'integer', minimum: 0, maximum: 1000000 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  ),
};
