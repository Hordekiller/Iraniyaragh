import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { InventoryMovementType, ReservationStatus, TransferStatus } from '@prisma/client';
import { INVENTORY_CHANGE_TYPES, MAX_TRANSFER_ITEMS } from './inventory.constants';

const inventoryMovementTypes = Object.values(InventoryMovementType);
const reservationStatuses = Object.values(ReservationStatus);
const transferStatuses = Object.values(TransferStatus);

const optionalVersion: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: { expectedVersion: { type: 'integer', minimum: 0 } },
};

const balance: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['warehouseId', 'locationId', 'variantId', 'onHand', 'reserved', 'available', 'version'],
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
  required: ['id', 'warehouseId', 'locationId', 'variantId', 'type', 'quantity', 'beforeOnHand', 'afterOnHand', 'reason', 'referenceType', 'referenceId', 'createdAt'],
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

const inventoryChange: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['warehouseId', 'locationId', 'variantId', 'delta', 'type'],
  properties: {
    warehouseId: { type: 'string' },
    locationId: { type: 'string' },
    variantId: { type: 'string' },
    delta: {
      type: 'integer',
      description: 'Positive for RECEIPT/ADJUSTMENT_IN; negative for ADJUSTMENT_OUT.',
    },
    type: { type: 'string', enum: [...INVENTORY_CHANGE_TYPES] },
    reason: { type: 'string', maxLength: 500 },
    referenceType: { type: 'string', maxLength: 100 },
    referenceId: { type: 'string', maxLength: 128 },
    expectedVersion: { type: 'integer', minimum: 0 },
  },
};

const warehouse: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'code', 'name', 'city', 'address', 'isActive', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    code: { type: 'string' },
    name: { type: 'string' },
    city: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const warehouseCreate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name'],
  properties: {
    code: { type: 'string', maxLength: 64 },
    name: { type: 'string', maxLength: 200 },
    city: { type: 'string', maxLength: 100 },
    address: { type: 'string', maxLength: 400 },
  },
};

const warehouseUpdate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    city: { type: 'string', maxLength: 100 },
    address: { type: 'string', maxLength: 400 },
    isActive: { type: 'boolean' },
  },
};

const location: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'warehouseId', 'code', 'name', 'zone', 'aisle', 'rack', 'shelf', 'bin', 'isActive', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    warehouseId: { type: 'string' },
    code: { type: 'string' },
    name: { type: 'string', nullable: true },
    zone: { type: 'string', nullable: true },
    aisle: { type: 'string', nullable: true },
    rack: { type: 'string', nullable: true },
    shelf: { type: 'string', nullable: true },
    bin: { type: 'string', nullable: true },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const locationCreate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', maxLength: 64 },
    name: { type: 'string', maxLength: 200 },
    zone: { type: 'string', maxLength: 64 },
    aisle: { type: 'string', maxLength: 64 },
    rack: { type: 'string', maxLength: 64 },
    shelf: { type: 'string', maxLength: 64 },
    bin: { type: 'string', maxLength: 64 },
  },
};

const locationUpdate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', maxLength: 200 },
    zone: { type: 'string', maxLength: 64 },
    aisle: { type: 'string', maxLength: 64 },
    rack: { type: 'string', maxLength: 64 },
    shelf: { type: 'string', maxLength: 64 },
    bin: { type: 'string', maxLength: 64 },
    isActive: { type: 'boolean' },
  },
};

const reservation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'warehouseId', 'locationId', 'variantId', 'orderId', 'quantity', 'status', 'expiresAt', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    warehouseId: { type: 'string' },
    locationId: { type: 'string' },
    variantId: { type: 'string' },
    orderId: { type: 'string', nullable: true },
    quantity: { type: 'integer', minimum: 1 },
    status: { type: 'string', enum: reservationStatuses },
    expiresAt: { type: 'string', format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const reservationCreate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['warehouseId', 'locationId', 'variantId', 'quantity', 'expiresAt'],
  properties: {
    warehouseId: { type: 'string' },
    locationId: { type: 'string' },
    variantId: { type: 'string' },
    orderId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    expiresAt: { type: 'string', format: 'date-time' },
    expectedVersion: { type: 'integer', minimum: 0 },
  },
};

const transferItem: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'variantId', 'quantity', 'sourceLocationId', 'targetLocationId'],
  properties: {
    id: { type: 'string' },
    variantId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    sourceLocationId: { type: 'string', nullable: true },
    targetLocationId: { type: 'string', nullable: true },
  },
};

const transferItemCreate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['variantId', 'quantity'],
  properties: {
    variantId: { type: 'string' },
    quantity: { type: 'integer', minimum: 1 },
    sourceLocationId: { type: 'string' },
    targetLocationId: { type: 'string' },
  },
};

const transfer: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'code', 'sourceWarehouseId', 'targetWarehouseId', 'status', 'version', 'items', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string' },
    code: { type: 'string' },
    sourceWarehouseId: { type: 'string' },
    targetWarehouseId: { type: 'string' },
    status: { type: 'string', enum: transferStatuses },
    version: { type: 'integer', minimum: 0 },
    items: { type: 'array', items: transferItem },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const transferCreate: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceWarehouseId', 'targetWarehouseId', 'items'],
  properties: {
    code: { type: 'string', maxLength: 64 },
    sourceWarehouseId: { type: 'string' },
    targetWarehouseId: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: MAX_TRANSFER_ITEMS,
      items: transferItemCreate,
    },
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
  inventoryChange,
  lifecycle: optionalVersion,
  location,
  locationCreate,
  locationList: listOf(location),
  locationUpdate,
  movement,
  movementList: listOf(movement),
  reservation,
  reservationCreate,
  reservationList: listOf(reservation),
  transfer,
  transferAction: optionalVersion,
  transferCreate,
  transferList: listOf(transfer),
  warehouse,
  warehouseCreate,
  warehouseList: listOf(warehouse),
  warehouseUpdate,
} as const;
