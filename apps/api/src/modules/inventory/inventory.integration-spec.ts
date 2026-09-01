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
  const prisma = new PrismaService();
  const auditLog = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, auditLog);
  let connected = false;
  let actorId = '';
  let actorRoleId = '';

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });

    await prisma.$connect();
    connected = true;

    const actor = await prisma.user.create({
      data: {
        mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
        status: 'ACTIVE',
        isMobileVerified: true,
        createdAt: new Date(Date.now() - 60_000),
        mobileVerifiedAt: new Date(),
      },
    });
    actorId = actor.id;
    const role = await prisma.role.create({
      data: { key: `INV-IT-${runId}`, name: `Inv integration ${runId}` },
    });
    actorRoleId = role.id;
    await prisma.userRole.create({
      data: { userId: actorId, roleId: role.id, assignedById: actorId },
    });

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
    await prisma.userRole.deleteMany({ where: { roleId: actorRoleId } });
    await prisma.role.deleteMany({ where: { id: actorRoleId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  const balanceWhere = () =>
    ({
      warehouseId_locationId_variantId: { warehouseId, locationId, variantId },
    }) as const;

  it('returns the original movement when an idempotency key is replayed with an identical payload', async () => {
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
      where: balanceWhere(),
    });
    expect(balance).toMatchObject({ onHand: 5, reserved: 0, available: 5, version: 1 });
  });

  it('rejects an idempotency-key replay whose payload conflicts', async () => {
    await expect(
      inventory.changeOnHand({
        warehouseId,
        locationId,
        variantId,
        delta: 99,
        type: InventoryMovementType.ADJUSTMENT_IN,
        reason: 'conflicting payload',
        idempotencyKey,
        actorId,
        requestId: `${requestIdPrefix}-idempotency-conflict`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      prisma.inventoryMovement.count({ where: { idempotencyKey } }),
    ).resolves.toBe(1);
  });

  it('rolls back every write when a serializable transaction fails', async () => {
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.inventoryBalance.update({
            where: balanceWhere(),
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
      where: balanceWhere(),
    });
    expect(after).toMatchObject({
      onHand: before.onHand,
      reserved: before.reserved,
      available: before.available,
      version: before.version,
    });
  });

  it('writes an exact audit row per command request id with a real actor', async () => {
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
      requestId,
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
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });

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

    const after = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(after).toEqual(before);
  });

  it('consuming a reservation reduces onHand, clears reserved and writes a movement', async () => {
    const reserveRequestId = `${requestIdPrefix}-consume-reserve`;
    const consumeRequestId = `${requestIdPrefix}-consume`;
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });

    const reservation = await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 3,
      expiresAt: new Date(Date.now() + 60_000),
      actorId,
      requestId: reserveRequestId,
    });
    expect(reservation.status).toBe('ACTIVE');

    const consumed = await inventory.consumeReservation(reservation.id, {
      actorId,
      requestId: consumeRequestId,
    });
    expect(consumed.status).toBe('CONSUMED');

    const replayed = await inventory.consumeReservation(reservation.id, {
      actorId,
      requestId: consumeRequestId,
    });
    expect(replayed.status).toBe('CONSUMED');

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.onHand).toBe(before.onHand - 3);
    expect(balance.reserved).toBe(0);
    expect(balance.available).toBe(balance.onHand - balance.reserved);

    const movement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'stock-reservation', referenceId: reservation.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(movement).not.toBeNull();
    expect(movement).toMatchObject({
      type: InventoryMovementType.SALE,
      quantity: -3,
      afterOnHand: before.onHand - 3,
    });

    const release = await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 2,
      expiresAt: new Date(Date.now() + 60_000),
      actorId,
      requestId: `${requestIdPrefix}-consume-release-reserve`,
    });
    const released = await inventory.releaseReservation(release.id, {
      actorId,
      requestId: `${requestIdPrefix}-consume-release`,
    });
    expect(released.status).toBe('RELEASED');

    const releaseMovement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'stock-reservation', referenceId: release.id },
    });
    expect(releaseMovement).toBeNull();

    const reserveAudit = await prisma.auditLog.findFirst({
      where: { requestId: reserveRequestId },
    });
    const consumeAudit = await prisma.auditLog.findFirst({
      where: { requestId: consumeRequestId },
    });
    expect(reserveAudit?.action).toBe('inventory.reservation.created');
    expect(consumeAudit?.action).toBe('inventory.reservation.consumed');
    expect(consumeAudit?.actorId).toBe(actorId);
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
      where: balanceWhere(),
    });
    expect(balance.reserved).toBe(0);
    expect(balance.available).toBe(balance.onHand - balance.reserved);
  });

  it('propagates a real balance inconsistency while expiring instead of swallowing it', async () => {
    const requestId = `${requestIdPrefix}-expiry-propagate`;
    await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 1,
      expiresAt: new Date(Date.now() - 60_000),
      actorId,
      requestId,
    });

    await prisma.inventoryBalance.update({
      where: balanceWhere(),
      data: { reserved: 0, available: { increment: 1 } },
    });

    await expect(
      inventory.expireReservations({ actorId, requestId }, { now: new Date() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('multiple concurrent reservations never double-spend or go negative', async () => {
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    const initial = before.onHand;
    const requestCount = 8;
    const perRequest = 1;

    const results = await Promise.allSettled(
      Array.from({ length: requestCount }, (_, i) =>
        inventory.reserve({
          warehouseId,
          locationId,
          variantId,
          orderId: null,
          quantity: perRequest,
          expiresAt: new Date(Date.now() + 120_000),
          actorId,
          requestId: `${requestIdPrefix}-concurrent-${i}`,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.onHand).toBe(initial);
    expect(balance.reserved).toBe(ok * perRequest);
    expect(balance.available).toBe(initial - ok * perRequest);
    expect(ok + rejected).toBe(requestCount);
    expect(ok).toBeGreaterThanOrEqual(1);
    expect(balance.available).toBeGreaterThanOrEqual(0);
    expect(balance.reserved).toBeLessThanOrEqual(initial);

    for (let i = 0; i < requestCount; i += 1) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        expect(r.value.status).toBe('ACTIVE');
        const auditRows = await prisma.auditLog.findMany({
          where: { requestId: `${requestIdPrefix}-concurrent-${i}` },
        });
        expect(auditRows).toHaveLength(1);
        expect(auditRows[0].action).toBe('inventory.reservation.created');
      }
    }
  });

  it('surfaces deterministic snapshots and movements through the service', async () => {
    const snapshots = await inventory.getSnapshots({ locationId });
    expect(snapshots.items).toHaveLength(1);
    expect(snapshots.items[0]).toMatchObject({
      warehouseId,
      locationId,
      variantId,
      version: expect.any(Number) as number,
    });

    const movements = await inventory.getMovements({ locationId });
    expect(movements.items.length).toBeGreaterThanOrEqual(2);
    const ids = movements.items.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    const createdAtValues = movements.items.map((m) => m.createdAt.getTime());
    expect([...createdAtValues]).toEqual([...createdAtValues].sort((a, b) => b - a));
  });
});
