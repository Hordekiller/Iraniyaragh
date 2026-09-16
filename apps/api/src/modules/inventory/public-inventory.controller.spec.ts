import { describe, expect, it, vi } from 'vitest';
import { PublicInventoryController } from './public-inventory.controller';

describe('PublicInventoryController', () => {
  it('returns aggregate availability and never requires a staff principal', async () => {
    const inventory = { getPublicAvailability: vi.fn().mockResolvedValue({ items: [{ variantId: 'v1', status: 'LOW_STOCK' }] }) };
    const controller = new PublicInventoryController(inventory as never);
    await expect(controller.availability({ variantIds: 'v1,v2' })).resolves.toEqual({ items: [{ variantId: 'v1', status: 'LOW_STOCK' }] });
    expect(inventory.getPublicAvailability).toHaveBeenCalledWith(['v1', 'v2']);
  });
});
