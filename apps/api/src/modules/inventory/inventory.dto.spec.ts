import 'reflect-metadata';

import { InventoryMovementType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  InventoryChangeDto,
  InventoryLifecycleDto,
  InventoryMovementQueryDto,
  InventoryReservationDto,
  InventorySnapshotQueryDto,
} from './inventory.dto';

const CHANGE = {
  warehouseId: 'wh',
  locationId: 'loc',
  variantId: 'variant',
  delta: 2,
  type: InventoryMovementType.RECEIPT,
  reason: 'periodic restock',
  referenceType: 'purchase-order',
  referenceId: 'po-42',
  expectedVersion: 5,
};

const RESERVATION = {
  warehouseId: 'wh',
  locationId: 'loc',
  variantId: 'variant',
  orderId: 'order-1',
  quantity: 3,
  expiresAt: '2030-01-01T00:00:00.000Z',
  expectedVersion: 1,
};

describe('Inventory DTO validation', () => {
  it('accepts a valid snapshot query and coerces bounds', async () => {
    const dto = plainToInstance(InventorySnapshotQueryDto, { offset: '4', limit: '25' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.offset).toBe(4);
    expect(dto.limit).toBe(25);
  });

  it('rejects out-of-range snapshot paging values', async () => {
    const dto = plainToInstance(InventorySnapshotQueryDto, { offset: '-1', limit: '0' });
    expect(await validate(dto)).toHaveLength(2);
  });

  it('accepts a valid movement query with an optional type filter', async () => {
    const dto = plainToInstance(InventoryMovementQueryDto, {
      ...CHANGE,
      limit: 10,
      type: InventoryMovementType.RECEIPT,
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects an unknown movement type filter', async () => {
    const dto = plainToInstance(InventoryMovementQueryDto, { type: 'DROP_AND_EVERYTHING' });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toContain('type');
  });

  it('accepts a valid change payload', async () => {
    const dto = plainToInstance(InventoryChangeDto, CHANGE);
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects a change payload with missing required fields', async () => {
    const dto = plainToInstance(InventoryChangeDto, { delta: 1, type: InventoryMovementType.RECEIPT });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['warehouseId', 'locationId', 'variantId']),
    );
  });

  it('rejects a change payload with invalid types and over-length references', async () => {
    const dto = plainToInstance(InventoryChangeDto, {
      ...CHANGE,
      delta: 'many',
      reason: 'x'.repeat(501),
      referenceType: 'x'.repeat(101),
      referenceId: 'x'.repeat(129),
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['delta', 'reason', 'referenceType', 'referenceId']),
    );
  });

  it('accepts a valid reservation payload', async () => {
    const dto = plainToInstance(InventoryReservationDto, RESERVATION);
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects a reservation payload with an invalid date or quantity', async () => {
    const dto = plainToInstance(InventoryReservationDto, {
      ...RESERVATION,
      quantity: 0,
      expiresAt: 'tomorrow-ish',
    });
    const errors = await validate(dto);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['quantity', 'expiresAt']),
    );
  });

  it('accepts an empty lifecycle payload and rejects a negative expectedVersion', async () => {
    const empty = plainToInstance(InventoryLifecycleDto, {});
    expect(await validate(empty)).toEqual([]);

    const negative = plainToInstance(InventoryLifecycleDto, { expectedVersion: -1 });
    expect(await validate(negative)).toHaveLength(1);
  });
});