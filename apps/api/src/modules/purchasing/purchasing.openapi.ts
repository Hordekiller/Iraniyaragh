import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const line: SchemaObject = { type: 'object', required: ['id', 'variantId', 'sku', 'orderedQty', 'receivedQty', 'unitCost', 'lineCost'],
  properties: { id: { type: 'string' }, variantId: { type: 'string' }, sku: { type: 'string' },
    orderedQty: { type: 'integer' }, receivedQty: { type: 'integer' }, unitCost: { type: 'string' }, lineCost: { type: 'string' } } };
const lineInput: SchemaObject = { type: 'object', required: ['variantId', 'orderedQty', 'unitCost'], properties: {
  variantId: { type: 'string' }, orderedQty: { type: 'integer', minimum: 1, maximum: 1_000_000 },
  unitCost: { type: 'string', pattern: '^[1-9][0-9]{0,18}$', description: 'Positive integer IRR, not a floating-point amount.' },
} };
const order: SchemaObject = { type: 'object', required: ['id', 'number', 'supplierId', 'warehouseId', 'status', 'version', 'expectedAt', 'notes', 'items', 'totalCost', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' }, number: { type: 'string' }, supplierId: { type: 'string' }, warehouseId: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] },
    version: { type: 'integer' }, expectedAt: { type: 'string', format: 'date-time', nullable: true },
    notes: { type: 'string', nullable: true }, items: { type: 'array', items: line }, totalCost: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
  } };
const page = (item: SchemaObject): SchemaObject => ({ type: 'object', required: ['items', 'count'], properties: {
  items: { type: 'array', items: item }, count: { type: 'integer' },
} });
const receiptLine: SchemaObject = { type: 'object', required: ['id', 'purchaseOrderItemId', 'variantId', 'locationId', 'quantity', 'movementId'], properties: {
  id: { type: 'string' }, purchaseOrderItemId: { type: 'string' }, variantId: { type: 'string' }, locationId: { type: 'string' },
  quantity: { type: 'integer' }, movementId: { type: 'string' },
} };
const receipt: SchemaObject = { type: 'object', required: ['id', 'number', 'purchaseOrderId', 'warehouseId', 'externalReference', 'actorId', 'receivedAt', 'lines'], properties: {
  id: { type: 'string' }, number: { type: 'string' }, purchaseOrderId: { type: 'string' }, warehouseId: { type: 'string' },
  externalReference: { type: 'string' }, actorId: { type: 'string' }, receivedAt: { type: 'string', format: 'date-time' },
  lines: { type: 'array', items: receiptLine },
} };
export const purchasingOpenApi = {
  order,
  list: page(order),
  options: page({ type: 'object', required: ['id', 'code', 'label'], properties: {
    id: { type: 'string' }, code: { type: 'string' }, label: { type: 'string' },
  } }),
  history: page({ type: 'object', required: ['id', 'action', 'actorId', 'createdAt'], properties: {
    id: { type: 'string' }, action: { type: 'string' }, actorId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  } }),
  create: { type: 'object', required: ['supplierId', 'warehouseId', 'items'], properties: {
    supplierId: { type: 'string' }, warehouseId: { type: 'string' }, expectedAt: { type: 'string', format: 'date-time', nullable: true },
    notes: { type: 'string', nullable: true }, items: { type: 'array', minItems: 1, maxItems: 100, items: lineInput },
  } } satisfies SchemaObject,
  update: { type: 'object', required: ['expectedVersion'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 }, expectedAt: { type: 'string', format: 'date-time', nullable: true },
    notes: { type: 'string', nullable: true }, items: { type: 'array', minItems: 1, maxItems: 100, items: lineInput },
  } } satisfies SchemaObject,
  action: { type: 'object', required: ['expectedVersion'], properties: { expectedVersion: { type: 'integer', minimum: 0 } } } satisfies SchemaObject,
  receipt,
  receipts: page(receipt),
  receiptLocations: page({ type: 'object', required: ['id', 'code', 'label'], properties: {
    id: { type: 'string' }, code: { type: 'string' }, label: { type: 'string' },
  } }),
  receive: { type: 'object', required: ['expectedVersion', 'externalReference', 'lines'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 }, externalReference: { type: 'string', minLength: 1, maxLength: 120 },
    lines: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', required: ['variantId', 'locationId', 'quantity'], properties: {
      variantId: { type: 'string' }, locationId: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 1_000_000 },
    } } },
  } } satisfies SchemaObject,
};
