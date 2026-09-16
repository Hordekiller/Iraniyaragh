import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from './inventory.service';

function createFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    warehouse: {
      findUnique: vi.fn().mockResolvedValue({ id: 'wh' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    warehouseLocation: {
      findFirst: vi.fn().mockResolvedValue({ id: 'loc' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'loc', warehouseId: 'wh' }),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn().mockResolvedValue({ id: 'variant' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    inventoryBalance: {
      findUnique: vi.fn().mockResolvedValue({ version: 1 }),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    inventoryMovement: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    stockReservation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    stockTransfer: {
      findUnique: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
    stockTransferTransition: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    ...overrides,
  };
}

function buildService() {
  const client = createFakeClient();
  const tx = createFakeClient();
  const prisma = {
    inventoryBalance: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inventoryMovement: { findMany: vi.fn(), count: vi.fn() },
    stockReservation: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    warehouse: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    warehouseLocation: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productVariant: { findMany: vi.fn() },
    stockTransfer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    stockTransferTransition: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn().mockImplementation(async (fn: (client: unknown) => Promise<unknown>) =>
      fn(tx as never),
    ),
  } as never;
  const audit = { record: vi.fn() } as never;
  const service = new InventoryService(prisma, audit);
  return { client, tx, audit, service, prisma: prisma as unknown as Record<string, unknown> };
}

const base = {
  warehouseId: 'wh',
  locationId: 'loc',
  variantId: 'variant',
  actorId: 'actor',
  requestId: 'request',
  type: InventoryMovementType.ADJUSTMENT_IN,
} as const;

describe('InventoryService guards and queries', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('rejects an adjustment without a reason before touching the database', async () => {
    await expect(
      ctx.service.changeOnHand({ ...base, delta: 3, type: InventoryMovementType.ADJUSTMENT_IN }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects zero and non-integer deltas', async () => {
    await expect(
      ctx.service.changeOnHand({ ...base, delta: 0, type: InventoryMovementType.RECEIPT }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      ctx.service.changeOnHand({ ...base, delta: 1.5, type: InventoryMovementType.RECEIPT }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects non-positive reservation quantities', async () => {
    await expect(
      ctx.service.reserve({
        ...base,
        orderId: null,
        quantity: 0,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale expectedVersion with a conflict without mutating', async () => {
    await expect(
      ctx.service.changeOnHand({
        ...base,
        delta: 3,
        reason: 'stale version test',
        expectedVersion: 999,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.inventoryBalance.upsert).not.toHaveBeenCalled();
    expect(ctx.tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  describe('stock identity error codes', () => {
    beforeEach(() => {
      ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ version: 1, onHand: 10, reserved: 0 });
    });

    it.each([
      {
        scenario: 'the warehouse does not exist',
        setup: () => ctx.tx.warehouse.findUnique.mockResolvedValue(null),
        code: 'WAREHOUSE_NOT_FOUND',
      },
      {
        scenario: 'the location is missing or inactive',
        setup: () => ctx.tx.warehouseLocation.findFirst.mockResolvedValue(null),
        code: 'LOCATION_NOT_FOUND',
      },
      {
        scenario: 'the variant does not exist',
        setup: () => ctx.tx.productVariant.findUnique.mockResolvedValue(null),
        code: 'SKU_NOT_FOUND',
      },
    ])('emits $code when $scenario', async ({ setup, code }) => {
      setup();

      await expect(
        ctx.service.changeOnHand({ ...base, delta: 3, reason: 'identity test' }),
      ).rejects.toMatchObject({ response: { code } });

      expect(ctx.tx.inventoryBalance.upsert).not.toHaveBeenCalled();
    });

    it('asserts stock identity before reserving', async () => {
      ctx.tx.productVariant.findUnique.mockResolvedValue(null);

      await expect(
        ctx.service.reserve({
          ...base,
          orderId: null,
          quantity: 2,
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        }),
      ).rejects.toMatchObject({ response: { code: 'SKU_NOT_FOUND' } });

      expect(ctx.tx.stockReservation.create).not.toHaveBeenCalled();
    });
  });

  it('rejects operations that would drive available stock negative', async () => {
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({
      version: 1,
      onHand: 10,
      reserved: 5,
    });

    await expect(
      ctx.service.changeOnHand({
        ...base,
        delta: -6,
        reason: 'negative available test',
        expectedVersion: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.inventoryBalance.upsert).not.toHaveBeenCalled();
  });

  it('rejects mutations without an actor or request id', async () => {
    await expect(
      ctx.service.changeOnHand({
        warehouseId: 'wh',
        locationId: 'loc',
        variantId: 'variant',
        delta: 1,
        type: InventoryMovementType.RECEIPT,
        actorId: '',
        requestId: 'request',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      ctx.service.expireReservations({ actorId: 'actor', requestId: '  ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes a movement and an audit row on a successful adjustment', async () => {
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue(null);
    ctx.tx.inventoryMovement.create.mockResolvedValue({ id: 'movement' });

    const result = await ctx.service.changeOnHand({
      ...base,
      delta: 4,
      reason: 'cycle count',
    });

    expect(result).toEqual({ id: 'movement' });
    expect(ctx.tx.inventoryBalance.upsert).toHaveBeenCalledOnce();
    expect(ctx.tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: InventoryMovementType.ADJUSTMENT_IN,
          quantity: 4,
          reason: 'cycle count',
        }),
      }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inventory.balance.changed',
        actorId: 'actor',
        requestId: 'request',
      }),
      ctx.tx,
    );
  });

  it('translates exhausted serialization aborts into a stable conflict', async () => {
    const abort = (code: string) =>
      Object.assign(new Error('Serialization abort'), {
        name: 'PrismaClientKnownRequestError',
        code,
      });
    ctx.prisma.$transaction = vi
      .fn()
      .mockRejectedValue(abort('P2034')) as never;

    await expect(
      ctx.service.changeOnHand({
        ...base,
        delta: 3,
        reason: 'serialization retry test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rethrows non-serializable errors immediately without extra retries', async () => {
    ctx.prisma.$transaction = vi
      .fn()
      .mockRejectedValue(new ConflictException('version conflict')) as never;

    await expect(
      ctx.service.changeOnHand({
        ...base,
        delta: 3,
        reason: 'non retryable test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('maps snapshots with filtered records, count and default paging', async () => {
    ctx.prisma.inventoryBalance.findMany.mockResolvedValue([{ onHand: 3, reserved: 1 }]);
    ctx.prisma.inventoryBalance.count.mockResolvedValue(1);

    const result = await ctx.service.getSnapshots({ variantId: 'variant' });

    expect(result).toEqual({
      items: [expect.objectContaining({ onHand: 3, reserved: 1 })],
      count: 1,
    });
    expect(ctx.prisma.inventoryBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { variantId: 'variant' },
        take: 50,
        skip: 0,
      }),
    );
  });

  it('maps movements with filtered records, count and clamped paging', async () => {
    ctx.prisma.inventoryMovement.findMany.mockResolvedValue([{ id: 'm', type: 'RECEIPT' }]);
    ctx.prisma.inventoryMovement.count.mockResolvedValue(1);

    const result = await ctx.service.getMovements({
      type: InventoryMovementType.RECEIPT,
      limit: 5000,
      offset: 2,
    });

    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'm', type: 'RECEIPT' })],
      count: 1,
    });
    expect(ctx.prisma.inventoryMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: InventoryMovementType.RECEIPT },
        take: 100,
        skip: 2,
      }),
    );
  });

  it('rejects a reservation when available stock is insufficient', async () => {
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({
      version: 1,
      onHand: 10,
      reserved: 8,
      available: 2,
    });

    await expect(
      ctx.service.reserve({
        ...base,
        orderId: null,
        quantity: 5,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });

    expect(ctx.tx.stockReservation.create).not.toHaveBeenCalled();
  });

  it('rejects a release when the reservation balance is missing', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue({
      id: 'r1',
      warehouseId: 'wh',
      locationId: 'loc',
      variantId: 'variant',
      quantity: 2,
    });
    ctx.prisma.inventoryBalance.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.releaseReservation('r1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'RESERVATION_STATE_CONFLICT' } });

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('emits RESERVATION_NOT_FOUND for an unknown reservation', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue(null);

    for (const action of ['releaseReservation', 'consumeReservation'] as const) {
      await expect(
        ctx.service[action]('missing', { actorId: 'actor', requestId: 'request' }),
      ).rejects.toMatchObject({ response: { code: 'RESERVATION_NOT_FOUND' } });
    }

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('emits RESERVATION_EXPIRED when releasing or consuming an expired reservation', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue({
      id: 'r1',
      warehouseId: 'wh',
      locationId: 'loc',
      variantId: 'variant',
      quantity: 2,
      status: 'EXPIRED',
    });

    for (const action of ['releaseReservation', 'consumeReservation'] as const) {
      await expect(
        ctx.service[action]('r1', { actorId: 'actor', requestId: 'request' }),
      ).rejects.toMatchObject({ response: { code: 'RESERVATION_EXPIRED' } });
    }

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('surfaces RESERVATION_EXPIRED from the transactional recheck as a race guard', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue({
      id: 'r1',
      warehouseId: 'wh',
      locationId: 'loc',
      variantId: 'variant',
      quantity: 2,
      status: 'ACTIVE',
    });
    ctx.prisma.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1 });
    ctx.tx.stockReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'EXPIRED' });
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1, reserved: 2 });

    await expect(
      ctx.service.releaseReservation('r1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'RESERVATION_EXPIRED' } });

    expect(ctx.tx.stockReservation.update).not.toHaveBeenCalled();
  });

  it('rejects releasing a reservation whose balance is inconsistent', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue({
      id: 'r1',
      warehouseId: 'wh',
      locationId: 'loc',
      variantId: 'variant',
      quantity: 2,
    });
    ctx.prisma.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1 });
    ctx.tx.stockReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'ACTIVE' });
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1, reserved: 0 });

    await expect(
      ctx.service.releaseReservation('r1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'RESERVATION_STATE_CONFLICT' } });
  });

  it('rejects consuming a reservation whose balance is inconsistent', async () => {
    ctx.prisma.stockReservation.findUnique.mockResolvedValue({
      id: 'r1',
      warehouseId: 'wh',
      locationId: 'loc',
      variantId: 'variant',
      quantity: 2,
    });
    ctx.prisma.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1 });
    ctx.tx.stockReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'ACTIVE' });
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1, reserved: 0 });

    await expect(
      ctx.service.consumeReservation('r1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'RESERVATION_STATE_CONFLICT' } });
  });

  it('rejects expiring a reservation whose balance is inconsistent', async () => {
    ctx.prisma.stockReservation.findMany.mockResolvedValue([
      {
        id: 'r1',
        warehouseId: 'wh',
        locationId: 'loc',
        variantId: 'variant',
        quantity: 2,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
      },
    ]);
    ctx.tx.stockReservation.findUnique.mockResolvedValue({ id: 'r1', status: 'ACTIVE' });
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ id: 'b1', version: 1, reserved: 0 });

    await expect(
      ctx.service.expireReservations({ actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'RESERVATION_STATE_CONFLICT' } });
  });
});

describe('InventoryService public availability', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('returns safe aggregate status for active variants and unknown for inactive or missing variants', async () => {
    const prisma = ctx.prisma as any;
    prisma.productVariant.findMany.mockResolvedValue([{ id: 'v-in' }, { id: 'v-low' }, { id: 'v-out' }]);
    prisma.inventoryBalance.findMany.mockResolvedValue([
      { variantId: 'v-in', available: 8 },
      { variantId: 'v-low', available: 2 },
      { variantId: 'v-out', available: 0 },
      { variantId: 'v-in', available: 1 },
    ]);

    await expect(ctx.service.getPublicAvailability(['v-in', 'v-low', 'v-out', 'v-missing', 'v-in']))
      .resolves.toEqual({ items: [
        { variantId: 'v-in', status: 'IN_STOCK' },
        { variantId: 'v-low', status: 'LOW_STOCK' },
        { variantId: 'v-out', status: 'OUT_OF_STOCK' },
        { variantId: 'v-missing', status: 'UNKNOWN' },
      ] });
  });

  it('short-circuits empty input without querying persistence', async () => {
    const prisma = ctx.prisma as any;
    await expect(ctx.service.getPublicAvailability([])).resolves.toEqual({ items: [] });
    expect(prisma.productVariant.findMany).not.toHaveBeenCalled();
    expect(prisma.inventoryBalance.findMany).not.toHaveBeenCalled();
  });
});

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tr-1',
    code: 'TRF-1',
    sourceWarehouseId: 'src',
    targetWarehouseId: 'dst',
    status: 'DRAFT',
    idempotencyKey: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        variantId: 'variant',
        quantity: 2,
        sourceLocationId: 'loc',
        targetLocationId: 'loc2',
      },
    ],
    ...overrides,
  };
}

describe('InventoryService warehouse and location management', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('lists warehouses with active filtering and paging', async () => {
    ctx.prisma.warehouse.findMany.mockResolvedValue([
      { id: 'w1', code: 'WH1', name: 'Main', city: null, address: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    ctx.prisma.warehouse.count.mockResolvedValue(1);

    const result = await ctx.service.listWarehouses({ isActive: true });

    expect(result.count).toBe(1);
    expect(ctx.prisma.warehouse.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true }, take: 50, skip: 0 }),
    );
  });

  it('creates a warehouse and records an audit trail', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue(null);
    ctx.tx.warehouse.create.mockResolvedValue({
      id: 'w1', code: 'WH1', name: 'Main', city: null, address: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await ctx.service.createWarehouse({ code: 'WH1', name: 'Main', actorId: 'actor', requestId: 'request' });

    expect(result).toEqual(expect.objectContaining({ id: 'w1', code: 'WH1' }));
    expect(ctx.tx.warehouse.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'WH1', name: 'Main' }) }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inventory.warehouse.created', entityId: 'w1' }),
      ctx.tx,
    );
  });

  it('rejects a duplicate warehouse code with WAREHOUSE_CODE_CONFLICT', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue({ id: 'w1', code: 'WH1' });

    await expect(
      ctx.service.createWarehouse({ code: 'WH1', name: 'Main', actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_CODE_CONFLICT' } });

    expect(ctx.tx.warehouse.create).not.toHaveBeenCalled();
  });

  it('rejects an empty warehouse code before touching the database', async () => {
    await expect(
      ctx.service.createWarehouse({ code: '  ', name: 'Main', actorId: 'actor', requestId: 'request' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates a warehouse name and active flag', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue({
      id: 'w1', code: 'WH1', name: 'Old', city: null, address: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    ctx.tx.warehouse.update.mockResolvedValue({
      id: 'w1', code: 'WH1', name: 'New', city: null, address: null, isActive: false, createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await ctx.service.updateWarehouse('w1', { name: 'New', isActive: false, actorId: 'actor', requestId: 'request' });

    expect(result).toEqual(expect.objectContaining({ name: 'New', isActive: false }));
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inventory.warehouse.updated', entityId: 'w1' }),
      ctx.tx,
    );
  });

  it('rejects updating an unknown warehouse with WAREHOUSE_NOT_FOUND', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.updateWarehouse('missing', { name: 'New', actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_NOT_FOUND' } });

    expect(ctx.tx.warehouse.update).not.toHaveBeenCalled();
  });

  it('lists locations scoped to a warehouse', async () => {
    ctx.prisma.warehouseLocation.findMany.mockResolvedValue([
      { id: 'w1l1', warehouseId: 'w1', code: 'A1', name: null, zone: null, aisle: null, rack: null, shelf: null, bin: null, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    ]);
    ctx.prisma.warehouseLocation.count.mockResolvedValue(1);

    const result = await ctx.service.listLocations('w1', {});

    expect(result.count).toBe(1);
    expect(ctx.prisma.warehouseLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { warehouseId: 'w1' }, take: 50, skip: 0 }),
    );
  });

  it('creates a location and records an audit trail', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue({ id: 'w1' });
    ctx.tx.warehouseLocation.findUnique.mockResolvedValue(null);
    ctx.tx.warehouseLocation.create.mockResolvedValue({
      id: 'w1l1', warehouseId: 'w1', code: 'A1', name: null, zone: null, aisle: null, rack: null, shelf: null, bin: null, isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });

    const result = await ctx.service.createLocation('w1', { code: 'A1', actorId: 'actor', requestId: 'request' });

    expect(result).toEqual(expect.objectContaining({ id: 'w1l1', code: 'A1', warehouseId: 'w1' }));
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inventory.location.created', entityId: 'w1l1' }),
      ctx.tx,
    );
  });

  it('rejects creating a location in an unknown warehouse', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.createLocation('missing', { code: 'A1', actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_NOT_FOUND' } });

    expect(ctx.tx.warehouseLocation.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate location code with LOCATION_CODE_CONFLICT', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue({ id: 'w1' });
    ctx.tx.warehouseLocation.findUnique.mockResolvedValue({ id: 'w1l1', warehouseId: 'w1', code: 'A1' });

    await expect(
      ctx.service.createLocation('w1', { code: 'A1', actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_CODE_CONFLICT' } });

    expect(ctx.tx.warehouseLocation.create).not.toHaveBeenCalled();
  });

  it('rejects updating an unknown location with LOCATION_NOT_FOUND', async () => {
    ctx.tx.warehouseLocation.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.updateLocation('missing', { name: 'Bin', actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_NOT_FOUND' } });

    expect(ctx.tx.warehouseLocation.update).not.toHaveBeenCalled();
  });

  it('lists reservations with filters', async () => {
    ctx.prisma.stockReservation.findMany.mockResolvedValue([
      { id: 'r1', status: 'ACTIVE', quantity: 3, warehouseId: 'wh', locationId: 'loc', variantId: 'variant', orderId: null, expiresAt: new Date('2026-01-02T00:00:00.000Z'), createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), idempotencyKey: 'internal-only' },
    ]);
    ctx.prisma.stockReservation.count.mockResolvedValue(1);

    const result = await ctx.service.getReservations({ status: 'ACTIVE', limit: 20 });

    expect(result.count).toBe(1);
    expect(result.items[0]).not.toHaveProperty('idempotencyKey');
    expect(ctx.prisma.stockReservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' }, take: 20, skip: 0 }),
    );
  });
});

describe('InventoryService transfer lifecycle', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
  });

  it('rejects a transfer without items before touching the database', async () => {
    await expect(
      ctx.service.createTransfer({
        sourceWarehouseId: 'src', targetWarehouseId: 'dst', items: [], actorId: 'actor', requestId: 'request',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([0, -1])('rejects transfer quantity %s before opening a transaction', async (quantity) => {
    await expect(ctx.service.createTransfer({
      sourceWarehouseId: 'src', targetWarehouseId: 'dst',
      items: [{ variantId: 'variant', quantity }], actorId: 'actor', requestId: 'request',
    })).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a transfer whose source and target warehouses are the same', async () => {
    await expect(
      ctx.service.createTransfer({
        sourceWarehouseId: 'same', targetWarehouseId: 'same',
        items: [{ variantId: 'variant', quantity: 1 }],
        actorId: 'actor', requestId: 'request',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a transfer referencing an unknown source warehouse', async () => {
    ctx.tx.warehouse.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.createTransfer({
        sourceWarehouseId: 'src', targetWarehouseId: 'dst',
        items: [{ variantId: 'variant', quantity: 1 }],
        actorId: 'actor', requestId: 'request',
      }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_NOT_FOUND' } });

    expect(ctx.tx.stockTransfer.create).not.toHaveBeenCalled();
  });

  it('rejects a transfer with an unknown SKU', async () => {
    ctx.tx.productVariant.findUnique.mockResolvedValue(null);

    await expect(
      ctx.service.createTransfer({
        sourceWarehouseId: 'src', targetWarehouseId: 'dst',
        items: [{ variantId: 'missing', quantity: 1 }],
        actorId: 'actor', requestId: 'request',
      }),
    ).rejects.toMatchObject({ response: { code: 'SKU_NOT_FOUND' } });
  });

  it('creates a DRAFT transfer and records an audit trail', async () => {
    ctx.tx.stockTransfer.create.mockResolvedValue(transferRow());

    const result = await ctx.service.createTransfer({
      sourceWarehouseId: 'src', targetWarehouseId: 'dst',
      items: [{ variantId: 'variant', quantity: 2, sourceLocationId: 'loc', targetLocationId: 'loc2' }],
      actorId: 'actor', requestId: 'request',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'tr-1', status: 'DRAFT' }));
    expect(ctx.tx.stockTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceWarehouseId: 'src',
          targetWarehouseId: 'dst',
          items: { create: [expect.objectContaining({ variantId: 'variant', quantity: 2 })] },
        }),
      }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inventory.transfer.created', entityId: 'tr-1' }),
      ctx.tx,
    );
  });

  it('replays a matching transfer for a repeated idempotency key', async () => {
    const existing = transferRow({ idempotencyKey: 'idem-1' });
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(existing);

    const result = await ctx.service.createTransfer({
      sourceWarehouseId: 'src', targetWarehouseId: 'dst',
      items: [{ variantId: 'variant', quantity: 2, sourceLocationId: 'loc', targetLocationId: 'loc2' }],
      idempotencyKey: 'idem-1',
      actorId: 'actor', requestId: 'request',
    });

    expect(result).toEqual(expect.objectContaining({ id: 'tr-1' }));
    expect(ctx.tx.stockTransfer.create).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with a different payload', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(
      transferRow({ idempotencyKey: 'idem-1', quantity: 99 }),
    );

    await expect(
      ctx.service.createTransfer({
        sourceWarehouseId: 'src', targetWarehouseId: 'dst',
        items: [{ variantId: 'variant', quantity: 2 }],
        idempotencyKey: 'idem-1',
        actorId: 'actor', requestId: 'request',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.stockTransfer.create).not.toHaveBeenCalled();
  });

  it('walks the request, approve, dispatch, receive lifecycle with stock movements', async () => {
    ctx.tx.stockTransfer.findUnique
      .mockResolvedValueOnce(transferRow({ status: 'DRAFT' }))
      .mockResolvedValueOnce(transferRow({ status: 'REQUESTED' }))
      .mockResolvedValueOnce(transferRow({ status: 'APPROVED' }))
      .mockResolvedValueOnce(transferRow({ status: 'IN_TRANSIT' }));

    ctx.tx.stockTransfer.update
      .mockResolvedValueOnce(transferRow({ status: 'REQUESTED' }))
      .mockResolvedValueOnce(transferRow({ status: 'APPROVED' }))
      .mockResolvedValueOnce(transferRow({ status: 'IN_TRANSIT' }))
      .mockResolvedValueOnce(transferRow({ status: 'RECEIVED' }));

    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ version: 1, onHand: 10, reserved: 0, available: 10 });

    await ctx.service.requestTransfer('tr-1', { actorId: 'actor', requestId: 'request' });
    await ctx.service.approveTransfer('tr-1', { actorId: 'actor', requestId: 'request' });
    await ctx.service.dispatchTransfer('tr-1', { actorId: 'actor', requestId: 'request' });
    const received = await ctx.service.receiveTransfer('tr-1', { actorId: 'actor', requestId: 'request' });

    expect(received).toEqual(expect.objectContaining({ status: 'RECEIVED' }));
    expect(ctx.tx.inventoryMovement.create).toHaveBeenCalledTimes(2);
    expect(ctx.tx.inventoryMovement.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ type: InventoryMovementType.TRANSFER_OUT, quantity: -2 }) }),
    );
    expect(ctx.tx.inventoryMovement.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ type: InventoryMovementType.TRANSFER_IN, quantity: 2 }) }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inventory.transfer.dispatched' }),
      ctx.tx,
    );
  });

  it('replays an identical transfer transition without repeating side effects', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(transferRow({ status: 'APPROVED' }));
    ctx.tx.stockTransferTransition.findUnique.mockResolvedValue({ transferId: 'tr-1', action: 'dispatch', expectedVersion: null });
    const result = await ctx.service.dispatchTransfer('tr-1', { actorId: 'actor', requestId: 'request', idempotencyKey: 'dispatch-1' });
    expect(result).toEqual(expect.objectContaining({ id: 'tr-1', status: 'APPROVED' }));
    expect(ctx.tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(ctx.tx.stockTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects an illegal transition with TRANSFER_STATE_CONFLICT', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(transferRow({ status: 'DRAFT' }));

    await expect(
      ctx.service.approveTransfer('tr-1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_STATE_CONFLICT' } });

    expect(ctx.tx.stockTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects dispatching without a source location', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(
      transferRow({ status: 'APPROVED', items: [{ id: 'item-1', variantId: 'variant', quantity: 2, sourceLocationId: null, targetLocationId: 'loc2' }] }),
    );

    await expect(
      ctx.service.dispatchTransfer('tr-1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_ITEM_LOCATION_REQUIRED' } });

    expect(ctx.tx.stockTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects receiving without a target location', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(
      transferRow({ status: 'IN_TRANSIT', items: [{ id: 'item-1', variantId: 'variant', quantity: 2, sourceLocationId: 'loc', targetLocationId: null }] }),
    );

    await expect(
      ctx.service.receiveTransfer('tr-1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_ITEM_LOCATION_REQUIRED' } });

    expect(ctx.tx.stockTransfer.update).not.toHaveBeenCalled();
  });

  it('rejects a dispatch that would drive source stock negative', async () => {
    ctx.tx.stockTransfer.findUnique.mockResolvedValue(transferRow({ status: 'APPROVED' }));
    ctx.tx.inventoryBalance.findUnique.mockResolvedValue({ version: 1, onHand: 1, reserved: 0, available: 1 });

    await expect(
      ctx.service.dispatchTransfer('tr-1', { actorId: 'actor', requestId: 'request' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(ctx.tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('cancels a transfer from DRAFT, REQUESTED and APPROVED', async () => {
    for (const status of ['DRAFT', 'REQUESTED', 'APPROVED']) {
      ctx.tx.stockTransfer.findUnique.mockResolvedValue(transferRow({ status }));
      ctx.tx.stockTransfer.update.mockResolvedValue(transferRow({ status: 'CANCELLED' }));

      const result = await ctx.service.cancelTransfer('tr-1', { actorId: 'actor', requestId: 'request' });

      expect(result).toEqual(expect.objectContaining({ status: 'CANCELLED' }));
    }
  });

  it('rejects cancelling an IN_TRANSIT or RECEIVED transfer', async () => {
    for (const status of ['IN_TRANSIT', 'RECEIVED']) {
      ctx.tx.stockTransfer.findUnique.mockResolvedValue(transferRow({ status }));

      await expect(
        ctx.service.cancelTransfer('tr-1', { actorId: 'actor', requestId: 'request' }),
      ).rejects.toMatchObject({ response: { code: 'TRANSFER_STATE_CONFLICT' } });
    }
  });

  it('emits TRANSFER_NOT_FOUND for an unknown transfer', async () => {
    (ctx.prisma.stockTransfer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(ctx.service.getTransfer('missing')).rejects.toMatchObject({
      response: { code: 'TRANSFER_NOT_FOUND' },
    });
  });

  it('lists transfers with status and warehouse filters', async () => {
    ctx.prisma.stockTransfer.findMany.mockResolvedValue([transferRow({ status: 'REQUESTED' })]);
    ctx.prisma.stockTransfer.count.mockResolvedValue(1);

    const result = await ctx.service.getTransfers({ status: 'REQUESTED', sourceWarehouseId: 'src' });

    expect(result.count).toBe(1);
    expect(ctx.prisma.stockTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'REQUESTED', sourceWarehouseId: 'src' }, take: 50, skip: 0 }),
    );
  });
});
