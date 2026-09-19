import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { InventoryMovementType } from '@prisma/client';

const inventoryMovementTypes = Object.values(InventoryMovementType);

const balance: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'warehouseId',
    'locationId',
    'variantId',
    'onHand',
    'reserved',
    'available',
    'version',
  ],
  properties: {
    warehouseId: { type: 'string' },
    locationId: { type: 'string' },
    variantId: { type: 'string' },
    onHand: { type: 'integer' },
    reserved: { type: 'integer', minimum: 0 },
    available: { type: 'integer' },
    version: { type: 'integer', minimum: 0 },
  },
};

const movement: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'warehouseId',
    'locationId',
    'variantId',
    'type',
    'quantity',
    'beforeOnHand',
    'afterOnHand',
    'reason',
    'referenceType',
    'referenceId',
    'createdAt',
  ],
  properties: {
    id: { type: 'string' },
    warehouseId: { type: 'string' },
    locationId: { type: 'string' },
    variantId: { type: 'string' },
    type: { type: 'string', enum: inventoryMovementTypes },
    quantity: { type: 'integer' },
    beforeOnHand: { type: 'integer' },
    afterOnHand: { type: 'integer' },
    reason: { type: 'string', nullable: true },
    referenceType: { type: 'string', nullable: true },
    referenceId: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

function listOf(item: SchemaObject): SchemaObject {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'count'],
    properties: {
      items: { type: 'array', items: item },
      count: { type: 'integer', minimum: 0 },
    },
  };
}

export const openApiInventory = {
  balanceList: listOf(balance),
  movement,
  movementList: listOf(movement),
} as const;
