import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const actor: SchemaObject = { type: 'object', required: ['id', 'name'], properties: {
  id: { type: 'string' }, name: { type: 'string' },
} };

/**
 * `expectedQty` and `difference` are only serialized for principals holding
 * `stocktake.approve`; blind counting is enforced in the service.
 */
const line: SchemaObject = { type: 'object',
  required: ['id', 'locationId', 'locationCode', 'locationName', 'variantId', 'sku', 'productName', 'variantTitle', 'countedQty', 'countedAt', 'notes', 'countedBy', 'movementId'],
  properties: {
    id: { type: 'string' }, locationId: { type: 'string' }, locationCode: { type: 'string' }, locationName: { type: 'string' },
    variantId: { type: 'string' }, sku: { type: 'string' }, productName: { type: 'string' }, variantTitle: { type: 'string', nullable: true },
    expectedQty: { type: 'integer', minimum: 0, description: 'Omitted for counters without stocktake.approve.' },
    countedQty: { type: 'integer', minimum: 0, nullable: true },
    difference: { type: 'integer', nullable: true, description: 'Omitted for counters without stocktake.approve.' },
    countedAt: { type: 'string', format: 'date-time', nullable: true },
    notes: { type: 'string', nullable: true }, countedBy: { ...actor, nullable: true }, movementId: { type: 'string', nullable: true },
  } };

const summary: SchemaObject = { type: 'object', required: ['totalLines', 'countedLines', 'pendingLines'], properties: {
  totalLines: { type: 'integer' }, countedLines: { type: 'integer' }, pendingLines: { type: 'integer' },
  netDifference: { type: 'integer', description: 'Omitted for counters without stocktake.approve.' },
} };

const header: SchemaObject = { type: 'object',
  required: ['id', 'number', 'status', 'scopeType', 'version', 'warehouseId', 'warehouseCode', 'warehouseName', 'notes', 'createdBy', 'countedBy', 'approvedBy', 'startedAt', 'submittedAt', 'completedAt', 'cancelledAt', 'createdAt', 'updatedAt', 'summary'],
  properties: {
    id: { type: 'string' }, number: { type: 'string' },
    status: { type: 'string', enum: ['DRAFT', 'COUNTING', 'REVIEW', 'COMPLETED', 'CANCELLED'] },
    scopeType: { type: 'string', enum: ['WAREHOUSE', 'LOCATIONS', 'VARIANTS'] },
    version: { type: 'integer' }, warehouseId: { type: 'string' }, warehouseCode: { type: 'string' }, warehouseName: { type: 'string' },
    notes: { type: 'string', nullable: true },
    createdBy: actor, countedBy: { ...actor, nullable: true }, approvedBy: { ...actor, nullable: true },
    startedAt: { type: 'string', format: 'date-time', nullable: true },
    submittedAt: { type: 'string', format: 'date-time', nullable: true },
    completedAt: { type: 'string', format: 'date-time', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' },
    summary,
  } };

const detail: SchemaObject = { ...header, required: [...(header.required ?? []), 'lines'], properties: { ...header.properties, lines: { type: 'array', items: line } } };

const page = (item: SchemaObject): SchemaObject => ({ type: 'object', required: ['items', 'count'], properties: {
  items: { type: 'array', items: item }, count: { type: 'integer' },
} });

export const stocktakeOpenApi = {
  detail,
  list: page(header),
  locations: page({ type: 'object', required: ['id', 'code', 'label'], properties: {
    id: { type: 'string' }, code: { type: 'string' }, label: { type: 'string' },
  } }),
  variants: page({ type: 'object', required: ['id', 'sku', 'label'], properties: {
    id: { type: 'string' }, sku: { type: 'string' }, label: { type: 'string' },
  } }),
  history: page({ type: 'object', required: ['id', 'action', 'actorId', 'createdAt'], properties: {
    id: { type: 'string' }, action: { type: 'string' }, actorId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  } }),
  create: { type: 'object', required: ['warehouseId'], properties: {
    warehouseId: { type: 'string' },
    scopeType: { type: 'string', enum: ['WAREHOUSE', 'LOCATIONS', 'VARIANTS'], default: 'WAREHOUSE' },
    locationIds: { type: 'array', maxItems: 500, items: { type: 'string' }, description: 'Required when scopeType is LOCATIONS.' },
    variantIds: { type: 'array', maxItems: 2000, items: { type: 'string' }, description: 'Required when scopeType is VARIANTS.' },
    notes: { type: 'string', maxLength: 500, nullable: true },
  } } satisfies SchemaObject,
  count: { type: 'object', required: ['expectedVersion', 'lines'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
    lines: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object',
      required: ['locationId', 'variantId', 'countedQty'],
      properties: { locationId: { type: 'string' }, variantId: { type: 'string' },
        countedQty: { type: 'integer', minimum: 0, maximum: 2_000_000_000 },
        notes: { type: 'string', maxLength: 500, nullable: true } } } },
  } } satisfies SchemaObject,
  action: { type: 'object', required: ['expectedVersion'], properties: {
    expectedVersion: { type: 'integer', minimum: 0 },
  } } satisfies SchemaObject,
};
