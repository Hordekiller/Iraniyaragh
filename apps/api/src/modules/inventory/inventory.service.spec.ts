import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventoryMovementType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryService } from './inventory.service';

function createFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    warehouseLocation: { findFirst: vi.fn().mockResolvedValue({ id: 'loc' }) },
    inventoryBalance: {
      findUnique: vi.fn().mockResolvedValue({ version: 1 }),
      upsert: vi.fn(),
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
    auditLog: { create: vi.fn() },
    ...overrides,
  };
}

function buildService() {
  const client = createFakeClient();
  const tx = createFakeClient();
  const prisma = {
    inventoryBalance: { findMany: vi.fn(), count: vi.fn() },
    inventoryMovement: { findMany: vi.fn(), count: vi.fn() },
    stockReservation: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
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
});