import { describe, expect, it, vi } from 'vitest';
import { InventoryController } from './inventory.controller';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { runWithRequestContext } from '../../common/request-context';

describe('InventoryController', () => {
  const service = {
    getSnapshots: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    getMovements: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    changeOnHand: vi.fn().mockResolvedValue({ id: 'movement-1' }),
    listWarehouses: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    createWarehouse: vi.fn().mockResolvedValue({ id: 'wh-1' }),
    updateWarehouse: vi.fn().mockResolvedValue({ id: 'wh-1' }),
    listLocations: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    createLocation: vi.fn().mockResolvedValue({ id: 'loc-1' }),
    updateLocation: vi.fn().mockResolvedValue({ id: 'loc-1' }),
    getReservations: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    reserve: vi.fn().mockResolvedValue({ id: 'res-1' }),
    releaseReservation: vi.fn().mockResolvedValue({ id: 'res-1', status: 'RELEASED' }),
    consumeReservation: vi.fn().mockResolvedValue({ id: 'res-1', status: 'CONSUMED' }),
    getTransfers: vi.fn().mockResolvedValue({ items: [], count: 0 }),
    createTransfer: vi.fn().mockResolvedValue({ id: 'tr-1' }),
    getTransfer: vi.fn().mockResolvedValue({ id: 'tr-1' }),
    requestTransfer: vi.fn().mockResolvedValue({ id: 'tr-1', status: 'REQUESTED' }),
    approveTransfer: vi.fn().mockResolvedValue({ id: 'tr-1', status: 'APPROVED' }),
    dispatchTransfer: vi.fn().mockResolvedValue({ id: 'tr-1', status: 'IN_TRANSIT' }),
    receiveTransfer: vi.fn().mockResolvedValue({ id: 'tr-1', status: 'RECEIVED' }),
    cancelTransfer: vi.fn().mockResolvedValue({ id: 'tr-1', status: 'CANCELLED' }),
  };
  const controller = new InventoryController(service as never);
  const principal = { userId: 'staff-1' } as never;

  const mutations = [
    'change',
    'createWarehouse',
    'updateWarehouse',
    'createLocation',
    'updateLocation',
    'reserve',
    'releaseReservation',
    'consumeReservation',
  ] as const;
  const readEndpoints = [
    'balances',
    'movements',
    'warehouses',
    'locations',
    'reservations',
  ] as const;
  const transferEndpoints = [
    'transfers',
    'createTransfer',
    'getTransfer',
    'requestTransfer',
    'dispatchTransfer',
    'receiveTransfer',
    'cancelTransfer',
  ] as const;
  const allEndpoints = [...readEndpoints, ...transferEndpoints, ...mutations] as const;

  it('declares staff MFA and fine-grained permissions on every endpoint', () => {
    const prototype = Object.getPrototypeOf(controller) as typeof controller;
    for (const method of allEndpoints) {
      expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, prototype.constructor)).toBe('STAFF_MFA');
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBeDefined();
    }
  });

  it('assigns the exact permission to each endpoint', () => {
    const prototype = Object.getPrototypeOf(controller) as typeof controller;
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.balances)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.movements)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.warehouses)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.locations)).toBe('inventory.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.reservations)).toBe('inventory.read');

    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.change)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.createWarehouse)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.updateWarehouse)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.createLocation)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.updateLocation)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.reserve)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.releaseReservation)).toBe('inventory.adjust');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.consumeReservation)).toBe('inventory.adjust');

    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.transfers)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.createTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.getTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.requestTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.dispatchTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.receiveTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.cancelTransfer)).toBe('inventory.transfer');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.approveTransfer)).toBe('inventory.approve');
  });

  it('passes bounded read queries through without exposing service internals', async () => {
    await expect(controller.balances({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.movements({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.warehouses({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.locations('wh-1', { limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.reservations({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    await expect(controller.transfers({ limit: 10, offset: 0 })).resolves.toEqual({ items: [], count: 0 });
    expect(service.getSnapshots).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(service.getMovements).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(service.listWarehouses).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(service.listLocations).toHaveBeenCalledWith('wh-1', { limit: 10, offset: 0 });
    expect(service.getReservations).toHaveBeenCalledWith({ limit: 10, offset: 0 });
    expect(service.getTransfers).toHaveBeenCalledWith({ limit: 10, offset: 0 });
  });

  it('fetches a single transfer by id', async () => {
    await expect(controller.getTransfer('tr-1')).resolves.toEqual({ id: 'tr-1' });
    expect(service.getTransfer).toHaveBeenCalledWith('tr-1');
  });

  it('binds actor and request context to stock changes', async () => {
    const input = { warehouseId: 'w', locationId: 'l', variantId: 'v', delta: 2, type: 'RECEIPT' } as never;
    await runWithRequestContext(
      { requestId: 'req-1', correlationId: 'req-1', startedAt: new Date().toISOString() },
      () => controller.change(principal, 'idem-1', input),
    );
    expect(service.changeOnHand).toHaveBeenCalledWith({ ...input, idempotencyKey: 'idem-1', actorId: 'staff-1', requestId: 'req-1' });
  });

  it('binds actor and request context to reservation lifecycle and transfer actor actions', async () => {
    await runWithRequestContext(
      { requestId: 'req-2', correlationId: 'req-2', startedAt: new Date().toISOString() },
      async () => {
        await controller.reserve(principal, 'idem-2', { warehouseId: 'w', locationId: 'l', variantId: 'v', quantity: 1, expiresAt: '2026-12-31T00:00:00.000Z' } as never);
        await controller.releaseReservation(principal, 'res-1', { expectedVersion: 3 } as never);
        await controller.consumeReservation(principal, 'res-1', { expectedVersion: 3 } as never);
        await controller.requestTransfer(principal, 'tr-1', { expectedVersion: 0 } as never);
        await controller.approveTransfer(principal, 'tr-1', { expectedVersion: 0 } as never);
        await controller.dispatchTransfer(principal, 'tr-1', { expectedVersion: 0 } as never);
        await controller.receiveTransfer(principal, 'tr-1', { expectedVersion: 0 } as never);
        await controller.cancelTransfer(principal, 'tr-1', { expectedVersion: 0 } as never);
      },
    );
    expect(service.reserve).toHaveBeenCalledWith({
      warehouseId: 'w', locationId: 'l', variantId: 'v', quantity: 1,
      expiresAt: new Date('2026-12-31T00:00:00.000Z'), idempotencyKey: 'idem-2', actorId: 'staff-1', requestId: 'req-2',
    });
    expect(service.releaseReservation).toHaveBeenCalledWith('res-1', { expectedVersion: 3, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.consumeReservation).toHaveBeenCalledWith('res-1', { expectedVersion: 3, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.requestTransfer).toHaveBeenCalledWith('tr-1', { expectedVersion: 0, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.approveTransfer).toHaveBeenCalledWith('tr-1', { expectedVersion: 0, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.dispatchTransfer).toHaveBeenCalledWith('tr-1', { expectedVersion: 0, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.receiveTransfer).toHaveBeenCalledWith('tr-1', { expectedVersion: 0, actorId: 'staff-1', requestId: 'req-2' });
    expect(service.cancelTransfer).toHaveBeenCalledWith('tr-1', { expectedVersion: 0, actorId: 'staff-1', requestId: 'req-2' });
  });

  it('binds actor and request context to warehouse and location CRUD', async () => {
    await runWithRequestContext(
      { requestId: 'req-3', correlationId: 'req-3', startedAt: new Date().toISOString() },
      async () => {
        await controller.createWarehouse(principal, { code: 'WH', name: 'Main' } as never);
        await controller.updateWarehouse(principal, 'wh-1', { name: 'Renamed' } as never);
        await controller.createLocation(principal, 'wh-1', { code: 'A1' } as never);
        await controller.updateLocation(principal, 'loc-1', { name: 'Bin' } as never);
      },
    );
    expect(service.createWarehouse).toHaveBeenCalledWith({ code: 'WH', name: 'Main', actorId: 'staff-1', requestId: 'req-3' });
    expect(service.updateWarehouse).toHaveBeenCalledWith('wh-1', { name: 'Renamed', actorId: 'staff-1', requestId: 'req-3' });
    expect(service.createLocation).toHaveBeenCalledWith('wh-1', { code: 'A1', actorId: 'staff-1', requestId: 'req-3' });
    expect(service.updateLocation).toHaveBeenCalledWith('loc-1', { name: 'Bin', actorId: 'staff-1', requestId: 'req-3' });
  });

  it('binds request context and idempotency key to transfer creation', async () => {
    await runWithRequestContext(
      { requestId: 'req-4', correlationId: 'req-4', startedAt: new Date().toISOString() },
      () => controller.createTransfer(principal, 'idem-3', { sourceWarehouseId: 'w1', targetWarehouseId: 'w2', items: [{ variantId: 'v1', quantity: 2 }] } as never),
    );
    expect(service.createTransfer).toHaveBeenCalledWith({
      sourceWarehouseId: 'w1', targetWarehouseId: 'w2',
      items: [{ variantId: 'v1', quantity: 2 }],
      idempotencyKey: 'idem-3', actorId: 'staff-1', requestId: 'req-4',
    });
  });
});