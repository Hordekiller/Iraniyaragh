import { InventoryMovementType } from '@prisma/client';
import {
  API_ERROR_CODES,
  INVENTORY_CHANGE_TYPES,
  INVENTORY_MOVEMENT_TYPES,
} from '@iranyaragh/contracts';
import { describe, expect, it } from 'vitest';

describe('inventory public error contract', () => {
  it('keeps shared movement values aligned with the database enum', () => {
    expect([...INVENTORY_MOVEMENT_TYPES].sort()).toEqual(
      Object.values(InventoryMovementType).sort(),
    );
  });

  it('exposes only receipt and manual adjustment types to the general change command', () => {
    expect(INVENTORY_CHANGE_TYPES).toEqual([
      InventoryMovementType.RECEIPT,
      InventoryMovementType.ADJUSTMENT_IN,
      InventoryMovementType.ADJUSTMENT_OUT,
    ]);
    expect(INVENTORY_CHANGE_TYPES).not.toContain(InventoryMovementType.SALE);
    expect(INVENTORY_CHANGE_TYPES).not.toContain(InventoryMovementType.TRANSFER_OUT);
  });

  it('registers the inventory codes in the shared error code union', () => {
    for (const code of [
      'SKU_NOT_FOUND',
      'WAREHOUSE_NOT_FOUND',
      'LOCATION_NOT_FOUND',
      'INSUFFICIENT_STOCK',
      'INVENTORY_VERSION_CONFLICT',
      'RESERVATION_NOT_FOUND',
      'RESERVATION_EXPIRED',
      'RESERVATION_STATE_CONFLICT',
      'TRANSFER_NOT_FOUND',
      'TRANSFER_VERSION_CONFLICT',
      'TRANSFER_STATE_CONFLICT',
      'TRANSFER_NO_ITEMS',
      'TRANSFER_ITEM_LOCATION_REQUIRED',
      'WAREHOUSE_CODE_CONFLICT',
      'LOCATION_CODE_CONFLICT',
    ]) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });
});
