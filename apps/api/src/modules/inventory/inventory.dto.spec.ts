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
  LocationCreateDto,
  LocationListQueryDto,
  LocationUpdateDto,
  TransferCreateDto,
  TransferItemCreateDto,
  WarehouseCreateDto,
  WarehouseListQueryDto,
  WarehouseUpdateDto,
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

  it.each([
    InventoryMovementType.SALE,
    InventoryMovementType.RETURN_IN,
    InventoryMovementType.RETURN_OUT,
    InventoryMovementType.TRANSFER_IN,
    InventoryMovementType.TRANSFER_OUT,
    InventoryMovementType.STOCKTAKE,
    InventoryMovementType.RESERVATION,
    InventoryMovementType.RELEASE,
  ])('rejects protected workflow movement type %s on the general change DTO', async (type) => {
    const dto = plainToInstance(InventoryChangeDto, { ...CHANGE, type });
    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'type' })]),
    );
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

  it('accepts valid warehouse create and update payloads', async () => {
    const create = plainToInstance(WarehouseCreateDto, { code: 'WH-1', name: 'Main' });
    expect(await validate(create)).toEqual([]);

    const update = plainToInstance(WarehouseUpdateDto, { name: 'Renamed', isActive: false });
    expect(await validate(update)).toEqual([]);

    const overLong = plainToInstance(WarehouseCreateDto, { code: 'x'.repeat(65), name: 'Main' });
    const missingName = plainToInstance(WarehouseCreateDto, { code: 'WH-1' });
    const badActive = plainToInstance(WarehouseUpdateDto, { isActive: 'yes' });
    expect(await validate(overLong)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'code' })]),
    );
    expect(await validate(missingName)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'name' })]),
    );
    expect(await validate(badActive)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'isActive' })]),
    );
  });

  it.each([
    [WarehouseListQueryDto, { isActive: 'false', isInactive: 'true' }],
    [LocationListQueryDto, { isActive: 'false', isInactive: 'true' }],
  ])('parses exact Boolean strings for %s', async (Dto, input) => {
    const dto = plainToInstance(Dto, input);
    expect(await validate(dto)).toEqual([]);
    expect(dto.isActive).toBe(false);
    expect(dto.isInactive).toBe(true);
  });

  it.each([WarehouseListQueryDto, LocationListQueryDto])(
    'rejects ambiguous Boolean query values for %s',
    async (Dto) => {
      const dto = plainToInstance(Dto, { isActive: 'yes', isInactive: '0' });
      expect((await validate(dto)).map((error) => error.property)).toEqual(
        expect.arrayContaining(['isActive', 'isInactive']),
      );
    },
  );

  it('accepts valid location create and update payloads', async () => {
    const create = plainToInstance(LocationCreateDto, { code: 'A1', zone: 'Zone B' });
    expect(await validate(create)).toEqual([]);

    const update = plainToInstance(LocationUpdateDto, { name: 'Bin', isActive: true });
    expect(await validate(update)).toEqual([]);

    const missingCode = plainToInstance(LocationCreateDto, {});
    expect(await validate(missingCode)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'code' })]),
    );
  });

  it('accepts a valid transfer payload with at least one item', async () => {
    const dto = plainToInstance(TransferCreateDto, {
      sourceWarehouseId: 'w1',
      targetWarehouseId: 'w2',
      items: [{ variantId: 'v1', quantity: 2, sourceLocationId: 'l1', targetLocationId: 'l2' }],
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('rejects a transfer payload with no items or invalid items', async () => {
    const emptyItems = plainToInstance(TransferCreateDto, {
      sourceWarehouseId: 'w1',
      targetWarehouseId: 'w2',
      items: [],
    });
    expect(await validate(emptyItems)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'items' })]),
    );

    const zeroQuantity = plainToInstance(TransferItemCreateDto, { variantId: 'v1', quantity: 0 });
    expect(await validate(zeroQuantity)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'quantity' })]),
    );

    const missingSku = plainToInstance(TransferItemCreateDto, { quantity: 2 });
    expect(await validate(missingSku)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'variantId' })]),
    );
  });
});
