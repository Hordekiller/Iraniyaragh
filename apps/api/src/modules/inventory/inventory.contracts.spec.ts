import { API_ERROR_CODES } from '@iranyaragh/contracts';
import { describe, expect, it } from 'vitest';

describe('inventory public error contract', () => {
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
