import { describe, expect, it } from 'vitest';
import { publicProductStockStatus } from './public-product-stock';

describe('public product stock', () => {
  it('reports no active variants or no positive available stock as unavailable', () => {
    expect(publicProductStockStatus([])).toBe('OUT_OF_STOCK');
    expect(publicProductStockStatus([[], [{ available: 0 }], [{ available: -1 }]])).toBe('OUT_OF_STOCK');
  });
  it('totals warehouses within each variant and preserves low-stock thresholds', () => {
    expect(publicProductStockStatus([[{ available: 3 }, { available: 3 }]])).toBe('IN_STOCK');
    expect(publicProductStockStatus([[{ available: 3 }], [{ available: 3 }]])).toBe('LOW_STOCK');
    expect(publicProductStockStatus([[{ available: 5 }], [{ available: 0 }]])).toBe('LOW_STOCK');
  });
  it('reports available if any active variant has sufficient stock', () => {
    expect(publicProductStockStatus([[{ available: 0 }], [{ available: 6 }]])).toBe('IN_STOCK');
  });
});
