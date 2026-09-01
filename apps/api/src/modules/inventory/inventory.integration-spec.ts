import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from './inventory.service';

describe.sequential('InventoryService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const warehouseId = `test_warehouse_${runId}`;
  const locationId = `test_location_${runId}`;
  const productId = `test_product_${runId}`;
  const variantId = `test_variant_${runId}`;
  const idempotencyKey = `test_adjustment_${runId}`;
  const requestIdPrefix = `invit-${runId}`;
  const actorId = `integration-actor-${runId}`;
  const prisma = new PrismaService();
  const auditLog = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, auditLog);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });

    await prisma.$connect();
    connected = true;

    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        code: `TEST-WH-${runId}`,
        name: 'Integration test warehouse',
      },
    });
    await prisma.warehouseLocation.create({
      data: {
        id: locationId,
        warehouseId,
        code: `TEST-LOC-${runId}`,
        name: 'Integration test location',
      },
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'Integration test product',
        slug: `integration-test-product-${runId}`,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId,
        sku: `TEST-SKU-${runId}`,
        title: 'Integration test variant',
        costPrice: 100000n,
        salePrice: 120000n,
      },
    });
  });

  afterAll(async () => {
    if (!connected) return;

    await prisma.auditLog.deleteMany({
      where: { requestId: { contains: requestIdPrefix } },
    });
    await prisma.stockReservation.deleteMany({ where: { variantId } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.warehouseLocation.deleteMany({ where: { id: locationId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.$disconnect();
  });

  it('returns the original movement when an idempotency key is replayed sequentially', async () => {
    const command = {
      warehouseId,
      locationId,
      variantId,
      delta: 5,
      type: InventoryMovementType.ADJUSTMENT_IN,
      reason: 'Database integration test',
      idempotencyKey,
      actorId,
      requestId: `${requestIdPrefix}-idempotency`,
    } as const;

    const first = await inventory.changeOnHand(command);
    const replay = await inventory.changeOnHand(command);

    expect(replay.id).toBe(first.id);
    await expect(
      prisma.inventoryMovement.count({ where: { idempotencyKey } }),
    ).resolves.toBe(1);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId,
          locationId,
          variantId,
        },
      },
    });
    expect(balance).toMatchObject({
      onHand: 5,
      reserved: 0,
      available: 5,
      version: 1,
    });
  });

  it('rolls back every write when a serializable transaction fails', async () => {
    const balanceWhere = {
      warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
    } as const;
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere,
    });

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.inventoryBalance.update({
            where: balanceWhere,
            data: {
              onHand: { increment: 7 },
              available: { increment: 7 },
              version: { increment: 1 },
            },
          });
          throw new Error('forced integration-test rollback');
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    ).rejects.toThrow('forced integration-test rollback');

    const after = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere,
    });
    expect(after).toMatchObject({
      onHand: before.onHand,
      reserved: before.reserved,
      available: before.available,
      version: before.version,
    });
  });

  it('writes an audit row asserting actor and request for movements', async () => {
    const requestId = `${requestIdPrefix}-audit`;
    await inventory.changeOnHand({
      warehouseId,
      locationId,
      variantId,
      delta: 2,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId,
    });

    const rows = await prisma.auditLog.findMany({ where: { requestId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId,
      action: 'inventory.balance.changed',
      entityType: 'inventory-movement',
    });
  });

  it('rejects manual corrections without a reason', async () => {
    await expect(
      inventory.changeOnHand({
        warehouseId,
        locationId,
        variantId,
        delta: 1,
        type: InventoryMovementType.ADJUSTMENT_OUT,
        actorId,
        requestId: `${requestIdPrefix}-no-reason`,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a stale expectedVersion without mutating the balance', async () => {
    const key = {
      warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
    } as const;
    const before = await prisma.inventoryBalance.findUniqueOrThrow({ where: key });

    await expect(
      inventory.changeOnHand({
        warehouseId,
        locationId,
        variantId,
        delta: 1,
        type: InventoryMovementType.RECEIPT,
        expectedVersion: 999,
        actorId,
        requestId: `${requestIdPrefix}-conflict`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const after = await prisma.inventoryBalance.findUniqueOrThrow({ where: key });
    expect(after).toEqual(before);
  });

  it('reserves, consumes and releases through the full lifecycle', async () => {
    const requestId = `${requestIdPrefix}-lifecycle`;

    const reservation = await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 3,
      expiresAt: new Date(Date.now() + 60_000),
      actorId,
      requestId,
    });
    expect(reservation.status).toBe('ACTIVE');

    let balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
      },
    });
    expect(balance).toMatchObject({ reserved: 3, available: 2 });

    const consumed = await inventory.consumeReservation(reservation.id, { actorId, requestId });
    expect(consumed.status).toBe('CONSUMED');

    const replayed = await inventory.consumeReservation(reservation.id, { actorId, requestId });
    expect(replayed.status).toBe('CONSUMED');

    balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
      },
    });
    expect(balance).toMatchObject({ reserved: 0, available: 2 });

    const second = await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 2,
      expiresAt: new Date(Date.now() + 60_000),
      actorId,
      requestId: `${requestIdPrefix}-release`,
    });

    const released = await inventory.releaseReservation(second.id, {
      actorId,
      requestId: `${requestIdPrefix}-release`,
    });
    expect(released.status).toBe('RELEASED');

    balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
      },
    });
    expect(balance).toMatchObject({ reserved: 0, available: 2 });

    const actions = await prisma.auditLog.findMany({ where: { requestId } });
    expect(actions.map((row) => row.action).sort()).toEqual([
      'inventory.reservation.consumed',
      'inventory.reservation.created',
      'inventory.reservation.released',
    ]);
  });

  it('rejects over-reservation beyond available stock', async () => {
    await expect(
      inventory.reserve({
        warehouseId,
        locationId,
        variantId,
        orderId: null,
        quantity: 999,
        expiresAt: new Date(Date.now() + 60_000),
        actorId,
        requestId: `${requestIdPrefix}-over-reserve`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('expires active reservations past their expiry and restores stock', async () => {
    const requestId = `${requestIdPrefix}-expiry`;
    const reservation = await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 1,
      expiresAt: new Date(Date.now() - 60_000),
      actorId,
      requestId,
    });

    const expired = await inventory.expireReservations(
      { actorId, requestId },
      { now: new Date() },
    );
    expect(expired).toBeGreaterThanOrEqual(1);

    const current = await prisma.stockReservation.findUniqueOrThrow({
      where: { id: reservation.id },
    });
    expect(current.status).toBe('EXPIRED');

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
      },
    });
    expect(balance).toMatchObject({ reserved: 0, available: 2 });

    const actions = await prisma.auditLog.findMany({ where: { requestId } });
    expect(actions.map((row) => row.action)).toContain('inventory.reservation.expired');
  });

  it('surfaces read-only snapshots and movements through the service', async () => {
    const snapshots = await inventory.getSnapshots({ locationId });
    expect(snapshots.items).toHaveLength(1);
    expect(snapshots.items[0]).toMatchObject({
      warehouseId,
      locationId,
      variantId,
      version: expect.any(Number) as number,
    });

    const movements = await inventory.getMovements({ locationId });
    expect(movements.items.length).toBeGreaterThanOrEqual(3);
    expect(movements.items[0]).toMatchObject({
      warehouseId,
      locationId,
      variantId,
      createdAt: expect.any(Date) as Date,
    });
  });
});