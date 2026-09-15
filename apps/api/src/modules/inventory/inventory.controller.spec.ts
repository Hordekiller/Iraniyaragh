import { describe, expect, it, vi } from 'vitest';
import { InventoryController } from './inventory.controller';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { runWithRequestContext } from '../../common/request-context';

describe('InventoryController', () => {
  const service = {
    getSnapshots: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    getMovements: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    changeOnHand: vi.fn().mockResolvedValue({ id: 'movement-1' }),
  };
  const controller = new InventoryController(service as never);
  const principal = { userId: 'staff-1' } as never;

  it('declares staff MFA and fine-grained permissions on every endpoint', () => {
    const prototype = Object.getPrototypeOf(controller) as typeof controller;
    for (const method of ['balances', 'movements', 'change'] as const) {
      expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, prototype.constructor)).toBe('STAFF_MFA');
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBeDefined();
    }
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.balances)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.movements)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.change)).toBe('inventory.adjust');
  });

  it('passes bounded read queries through without exposing service internals', async () => {
    await expect(controller.balances({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.movements({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    expect(service.getSnapshots).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(service.getMovements).toHaveBeenCalledWith({ limit: 10, offset: 0 });
  });

  it('binds actor and request context to stock changes', async () => {
    const input = { warehouseId: 'w', locationId: 'l', variantId: 'v', delta: 2, type: 'RECEIPT' } as never;
    await runWithRequestContext(
      { requestId: 'req-1', correlationId: 'req-1', startedAt: new Date().toISOString() },
      () => controller.change(principal, 'idem-1', input),
    );
    expect(service.changeOnHand).toHaveBeenCalledWith({ ...input, idempotencyKey: 'idem-1', actorId: 'staff-1', requestId: 'req-1' });
  });
});
