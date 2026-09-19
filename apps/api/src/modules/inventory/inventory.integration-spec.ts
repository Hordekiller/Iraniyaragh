import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku, combinationSignature } from '../catalog/variant-identifiers';
import { InventoryService } from './inventory.service';

describe.sequential('InventoryService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const warehouseId = `test_warehouse_${runId}`;
  const locationId = `test_location_${runId}`;
  const productId = `test_product_${runId}`;
  const variantId = `test_variant_${runId}`;
  const sourceWarehouseId = `test_wh_src_${runId}`;
  const sourceLocationId = `test_loc_src_${runId}`;
  const targetWarehouseId = `test_wh_dst_${runId}`;
  const targetLocationId = `test_loc_dst_${runId}`;
  const transferVariantId = `test_variant_trf_${runId}`;
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
      data: { key: `inv-it-${runId}`, name: `Inv integration ${runId}` },
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
        skuKey: canonicalizeSku(`TEST-SKU-${runId}`),
        combinationSignature: EMPTY_AXIS_SIGNATURE,
        title: 'Integration test variant',
        costPrice: 100000n,
        salePrice: 120000n,
      },
    });

    await prisma.warehouse.create({
      data: {
        id: sourceWarehouseId,
        code: `TEST-WH-SRC-${runId}`,
        name: 'Integration test source warehouse',
      },
    });
    await prisma.warehouseLocation.create({
      data: {
        id: sourceLocationId,
        warehouseId: sourceWarehouseId,
        code: `TEST-LOC-SRC-${runId}`,
        name: 'Integration test source location',
      },
    });
    await prisma.warehouse.create({
      data: {
        id: targetWarehouseId,
        code: `TEST-WH-DST-${runId}`,
        name: 'Integration test target warehouse',
      },
    });
    await prisma.warehouseLocation.create({
      data: {
        id: targetLocationId,
        warehouseId: targetWarehouseId,
        code: `TEST-LOC-DST-${runId}`,
        name: 'Integration test target location',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: transferVariantId,
        productId,
        sku: `TEST-SKU-TRF-${runId}`,
        skuKey: canonicalizeSku(`TEST-SKU-TRF-${runId}`),
        combinationSignature: combinationSignature([
          { attributeId: 'transfer-axis', optionId: 'transfer-option' },
        ]),
        title: 'Integration test transfer variant',
        costPrice: 50000n,
        salePrice: 60000n,
      },
    });
  });

  afterAll(async () => {
    if (!connected) return;

    await prisma.auditLog.deleteMany({
      where: { requestId: { contains: requestIdPrefix } },
    });
    await prisma.stockReservation.deleteMany({
      where: { variantId: { in: [variantId, transferVariantId] } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { variantId: { in: [variantId, transferVariantId] } },
    });
    await prisma.inventoryBalance.deleteMany({
      where: { variantId: { in: [variantId, transferVariantId] } },
    });
    await prisma.stockTransfer.deleteMany({
      where: {
        sourceWarehouseId: { in: [sourceWarehouseId, warehouseId] },
      },
    });
    await prisma.warehouseLocation.deleteMany({
      where: { warehouseId: { in: [sourceWarehouseId, targetWarehouseId, warehouseId] } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: [sourceWarehouseId, targetWarehouseId, warehouseId] } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: [variantId, transferVariantId] } },
    });
    await prisma.product.deleteMany({ where: { id: productId } });
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

    await prisma.inventoryBalance.update({
      where: balanceWhere(),
      data: { reserved: 0, available: { increment: 1 } },
    });

    await expect(
      inventory.expireReservations({ actorId, requestId }, { now: new Date() }),
    ).rejects.toBeInstanceOf(ConflictException);

    await prisma.stockReservation.delete({ where: { id: reservation.id } });

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    const activeQuantity = await prisma.stockReservation.aggregate({
      where: { variantId, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    expect(activeQuantity._sum.quantity ?? 0).toBe(balance.reserved);
  });

  it('multiple concurrent reservations never double-spend or go negative', async () => {
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    const initial = before.onHand;
    const requestCount = 8;
    const perRequest = 1;
    const capacity = before.available;

    const reservationsBefore = await prisma.stockReservation.count({
      where: { variantId },
    });

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

    const rejected = results.filter((r) => r.status === 'rejected');
    const ok = results.length - rejected.length;

    expect(ok).toBe(capacity);
    expect(ok + rejected.length).toBe(requestCount);

    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.onHand).toBe(initial);
    expect(balance.reserved).toBe(ok * perRequest);
    expect(balance.available).toBe(initial - ok * perRequest);
    expect(balance.available).toBeGreaterThanOrEqual(0);
    expect(balance.reserved).toBeLessThanOrEqual(initial);

    expect(
      await prisma.stockReservation.count({ where: { variantId } }),
    ).toBe(reservationsBefore + ok);

    const auditRows = await prisma.auditLog.findMany({
      where: { requestId: { startsWith: `${requestIdPrefix}-concurrent-` } },
    });
    expect(auditRows).toHaveLength(ok);
    for (const row of auditRows) {
      expect(row.action).toBe('inventory.reservation.created');
    }

    const activeQuantity = await prisma.stockReservation.aggregate({
      where: { variantId, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    expect(activeQuantity._sum.quantity ?? 0).toBe(balance.reserved);
  });

  it('keeps parallel reservations and stock changes consistent under serializable contention', async () => {
    const seedRequestId = `${requestIdPrefix}-race-seed`;
    await inventory.changeOnHand({
      warehouseId,
      locationId,
      variantId,
      delta: 6,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId: seedRequestId,
    });

    const reservationsBefore = await prisma.stockReservation.count({
      where: { variantId },
    });
    const movementsBefore = await prisma.inventoryMovement.count({
      where: { variantId },
    });
    const auditBefore = await prisma.auditLog.count({
      where: { requestId: { startsWith: `${requestIdPrefix}-race-` } },
    });

    const reserveOps = Array.from({ length: 4 }, (_, i) =>
      inventory.reserve({
        warehouseId,
        locationId,
        variantId,
        orderId: null,
        quantity: 1,
        expiresAt: new Date(Date.now() + 120_000),
        actorId,
        requestId: `${requestIdPrefix}-race-reserve-${i}`,
      }),
    );
    const addOps = Array.from({ length: 4 }, (_, i) =>
      inventory.changeOnHand({
        warehouseId,
        locationId,
        variantId,
        delta: 2,
        type: InventoryMovementType.RECEIPT,
        actorId,
        requestId: `${requestIdPrefix}-race-add-${i}`,
      }),
    );
    const subOps = Array.from({ length: 2 }, (_, i) =>
      inventory.changeOnHand({
        warehouseId,
        locationId,
        variantId,
        delta: -1,
        type: InventoryMovementType.ADJUSTMENT_OUT,
        reason: 'Parallel race integration test',
        actorId,
        requestId: `${requestIdPrefix}-race-sub-${i}`,
      }),
    );

    const [reserves, adds, subs] = await Promise.all([
      Promise.allSettled(reserveOps),
      Promise.allSettled(addOps),
      Promise.allSettled(subOps),
    ]);

    const all = [...reserves, ...adds, ...subs];
    for (const r of all) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
    }
    const ok = all.filter((r) => r.status === 'fulfilled').length;

    const movementDrift =
      (await prisma.inventoryMovement.count({ where: { variantId } })) -
      movementsBefore;
    const fulfilledAdds = adds.filter((r) => r.status === 'fulfilled').length;
    const fulfilledSubs = subs.filter((r) => r.status === 'fulfilled').length;
    expect(movementDrift).toBe(fulfilledAdds + fulfilledSubs);

    const auditDrift =
      (await prisma.auditLog.count({
        where: { requestId: { startsWith: `${requestIdPrefix}-race-` } },
      })) - auditBefore;
    expect(auditDrift).toBe(ok);

    const after = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(after.available).toBeGreaterThanOrEqual(0);
    expect(after.available).toBe(after.onHand - after.reserved);

    const activeQuantity = await prisma.stockReservation.aggregate({
      where: { variantId, status: 'ACTIVE' },
      _sum: { quantity: true },
    });
    expect(activeQuantity._sum.quantity ?? 0).toBe(after.reserved);

    const fulfilledReserves = reserves.filter(
      (r) => r.status === 'fulfilled',
    ).length;
    expect(
      await prisma.stockReservation.count({ where: { variantId } }),
    ).toBe(reservationsBefore + fulfilledReserves);
  });

  it('applies exactly one effect when identical idempotent commands race', async () => {
    const key = `${idempotencyKey}-race-identical`;
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    const suffix = `${requestIdPrefix}-idem-race-same-`;

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        inventory.changeOnHand({
          warehouseId,
          locationId,
          variantId,
          delta: 2,
          type: InventoryMovementType.RECEIPT,
          idempotencyKey: key,
          actorId,
          requestId: `${suffix}${i}`,
        }),
      ),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
    }

    const movements = await prisma.inventoryMovement.findMany({
      where: { idempotencyKey: key },
    });
    expect(movements).toHaveLength(1);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of fulfilled) {
      expect(r.value.id).toBe(movements[0].id);
    }

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.onHand).toBe(before.onHand + movements[0].quantity);
    expect(balance.version).toBe(before.version + 1);

    const audits = await prisma.auditLog.findMany({
      where: { requestId: { startsWith: suffix } },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'inventory.balance.changed',
      entityType: 'inventory-movement',
    });

    const replay = await inventory.changeOnHand({
      warehouseId,
      locationId,
      variantId,
      delta: 2,
      type: InventoryMovementType.RECEIPT,
      idempotencyKey: key,
      actorId,
      requestId: `${requestIdPrefix}-idem-race-replay`,
    });
    expect(replay.id).toBe(movements[0].id);
  });

  it('keeps a single effect and conflicts the loser of a same-key, different-payload race', async () => {
    const key = `${idempotencyKey}-race-conflict`;
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });

    const payloads = [
      {
        delta: 3,
        type: InventoryMovementType.RECEIPT,
        reason: undefined,
      },
      {
        delta: 99,
        type: InventoryMovementType.ADJUSTMENT_IN,
        reason: 'conflicting payload race',
      },
    ];

    const results = await Promise.allSettled(
      payloads.map((p, i) =>
        inventory.changeOnHand({
          warehouseId,
          locationId,
          variantId,
          delta: p.delta,
          type: p.type,
          reason: p.reason,
          idempotencyKey: key,
          actorId,
          requestId: `${requestIdPrefix}-idem-race-payload-${i}`,
        }),
      ),
    );

    const accepted = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(ConflictException);

    const movements = await prisma.inventoryMovement.findMany({
      where: { idempotencyKey: key },
    });
    expect(movements).toHaveLength(1);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.onHand).toBe(before.onHand + movements[0].quantity);
    expect(balance.version).toBe(before.version + 1);

    const audits = await prisma.auditLog.findMany({
      where: {
        requestId: { startsWith: `${requestIdPrefix}-idem-race-payload-` },
      },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'inventory.balance.changed',
      entityType: 'inventory-movement',
    });
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
    const createdAtValues = movements.items.map((m) => Date.parse(m.createdAt));
    expect([...createdAtValues]).toEqual([...createdAtValues].sort((a, b) => b - a));
  });

  it('returns the original reservation when an idempotency key is replayed with the same payload', async () => {
    const key = `test-reservation-idem-${runId}`;
    const payload = {
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 1,
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: key,
      actorId,
      requestId: `${requestIdPrefix}-reservation-idem-first`,
    } as const;

    const first = await inventory.reserve(payload);
    const replay = await inventory.reserve(payload);

    expect(replay.id).toBe(first.id);
    await expect(
      prisma.stockReservation.count({ where: { idempotencyKey: key } }),
    ).resolves.toBe(1);

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: balanceWhere(),
    });
    expect(balance.reserved).toBeGreaterThanOrEqual(1);
  });

  it('rejects a reservation idempotency replay with a different payload', async () => {
    const key = `test-reservation-idem-conflict-${runId}`;
    await inventory.reserve({
      warehouseId,
      locationId,
      variantId,
      orderId: null,
      quantity: 1,
      expiresAt: new Date(Date.now() + 60_000),
      idempotencyKey: key,
      actorId,
      requestId: `${requestIdPrefix}-reservation-idem-conflict-first`,
    });

    await expect(
      inventory.reserve({
        warehouseId,
        locationId,
        variantId,
        orderId: null,
        quantity: 99,
        expiresAt: new Date(Date.now() + 60_000),
        idempotencyKey: key,
        actorId,
        requestId: `${requestIdPrefix}-reservation-idem-conflict-second`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates and updates warehouses and locations, rejecting duplicate codes', async () => {
    const suffix = `wh-${runId}`;

    const created = await inventory.createWarehouse({
      code: `CRUD-WH-${suffix}`,
      name: 'CRUD warehouse',
      actorId,
      requestId: `${requestIdPrefix}-wh-create`,
    });
    expect(created.code).toBe(`CRUD-WH-${suffix}`);

    await expect(
      inventory.createWarehouse({
        code: `CRUD-WH-${suffix}`,
        name: 'Duplicate warehouse',
        actorId,
        requestId: `${requestIdPrefix}-wh-duplicate`,
      }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_CODE_CONFLICT' } });

    const updated = await inventory.updateWarehouse(created.id, {
      name: 'Renamed CRUD warehouse',
      isActive: false,
      actorId,
      requestId: `${requestIdPrefix}-wh-update`,
    });
    expect(updated.name).toBe('Renamed CRUD warehouse');
    expect(updated.isActive).toBe(false);

    const listed = await inventory.listWarehouses({ limit: 100 });
    expect(listed.items.some((w: { id: string }) => w.id === created.id)).toBe(true);

    const location = await inventory.createLocation(created.id, {
      code: 'CRUD-LOC',
      actorId,
      requestId: `${requestIdPrefix}-loc-create`,
    });
    expect(location.warehouseId).toBe(created.id);

    await expect(
      inventory.createLocation(created.id, {
        code: 'CRUD-LOC',
        actorId,
        requestId: `${requestIdPrefix}-loc-duplicate`,
      }),
    ).rejects.toMatchObject({ response: { code: 'LOCATION_CODE_CONFLICT' } });

    await expect(
      inventory.createLocation('missing-warehouse', {
        code: 'X',
        actorId,
        requestId: `${requestIdPrefix}-loc-missing-wh`,
      }),
    ).rejects.toMatchObject({ response: { code: 'WAREHOUSE_NOT_FOUND' } });

    await inventory.updateLocation(location.id, {
      name: 'Renamed location',
      actorId,
      requestId: `${requestIdPrefix}-loc-update`,
    });

    const listedLocations = await inventory.listLocations(created.id, { limit: 100 });
    expect(listedLocations.items.some((l: { id: string }) => l.id === location.id)).toBe(true);

    await prisma.warehouseLocation.deleteMany({ where: { id: location.id } });
    await prisma.warehouse.deleteMany({ where: { id: created.id } });
  });

  it('moves stock through the full transfer lifecycle with movements and audit', async () => {
    const requestId = `${requestIdPrefix}-transfer-lifecycle`;
    await inventory.changeOnHand({
      warehouseId: sourceWarehouseId,
      locationId: sourceLocationId,
      variantId: transferVariantId,
      delta: 10,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId: `${requestId}-seed`,
    });

    const beforeSource = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId: sourceWarehouseId, locationId: sourceLocationId, variantId: transferVariantId } },
    });
    expect(beforeSource.onHand).toBe(10);

    const transfer = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [
        {
          variantId: transferVariantId,
          quantity: 4,
          sourceLocationId,
          targetLocationId,
        },
      ],
      actorId,
      requestId: `${requestId}-create`,
    });
    expect(transfer.status).toBe('DRAFT');

    const requested = await inventory.requestTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-request`,
    });
    expect(requested.status).toBe('REQUESTED');

    const approved = await inventory.approveTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-approve`,
    });
    expect(approved.status).toBe('APPROVED');

    const dispatched = await inventory.dispatchTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-dispatch`,
    });
    expect(dispatched.status).toBe('IN_TRANSIT');

    const afterDispatchSource = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId: sourceWarehouseId, locationId: sourceLocationId, variantId: transferVariantId } },
    });
    expect(afterDispatchSource.onHand).toBe(6);

    const received = await inventory.receiveTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-receive`,
    });
    expect(received.status).toBe('RECEIVED');

    const afterReceiveTarget = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId: targetWarehouseId, locationId: targetLocationId, variantId: transferVariantId } },
    });
    expect(afterReceiveTarget.onHand).toBe(4);

    const outMovement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'stock-transfer', referenceId: transfer.code, type: InventoryMovementType.TRANSFER_OUT },
    });
    expect(outMovement).not.toBeNull();
    expect(outMovement).toMatchObject({ quantity: -4, afterOnHand: 6 });

    const inMovement = await prisma.inventoryMovement.findFirst({
      where: { referenceType: 'stock-transfer', referenceId: transfer.code, type: InventoryMovementType.TRANSFER_IN },
    });
    expect(inMovement).not.toBeNull();
    expect(inMovement).toMatchObject({ quantity: 4, afterOnHand: 4 });

    const audits = await prisma.auditLog.findMany({
      where: { requestId: { startsWith: requestId } },
      orderBy: { createdAt: 'asc' },
    });
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual([
      'inventory.balance.changed',
      'inventory.transfer.created',
      'inventory.transfer.requested',
      'inventory.transfer.approved',
      'inventory.transfer.dispatched',
      'inventory.transfer.received',
    ]);
  });

  it('applies a multi-line transfer to one balance with an exact ledger chain', async () => {
    const requestId = `${requestIdPrefix}-transfer-multi-line`;
    const seeded = await inventory.changeOnHand({
      warehouseId: sourceWarehouseId,
      locationId: sourceLocationId,
      variantId: transferVariantId,
      delta: 5,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId: `${requestId}-seed`,
    });
    const before = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId: sourceWarehouseId,
          locationId: sourceLocationId,
          variantId: transferVariantId,
        },
      },
    });

    const transfer = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [
        { variantId: transferVariantId, quantity: 2, sourceLocationId, targetLocationId },
        { variantId: transferVariantId, quantity: 1, sourceLocationId, targetLocationId },
      ],
      actorId,
      requestId: `${requestId}-create`,
    });
    const requested = await inventory.requestTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-request`,
    });
    const approved = await inventory.approveTransfer(requested.id, {
      actorId,
      requestId: `${requestId}-approve`,
    });
    await inventory.dispatchTransfer(approved.id, {
      actorId,
      requestId: `${requestId}-dispatch`,
    });

    const after = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId: sourceWarehouseId,
          locationId: sourceLocationId,
          variantId: transferVariantId,
        },
      },
    });
    expect(after.onHand).toBe(before.onHand - 3);
    expect(after.version).toBe(before.version + 1);
    expect(seeded.afterOnHand).toBe(before.onHand);

    const movements = await prisma.inventoryMovement.findMany({
      where: {
        referenceType: 'stock-transfer',
        referenceId: transfer.code,
        type: InventoryMovementType.TRANSFER_OUT,
      },
    });
    expect(movements).toHaveLength(2);
    expect(movements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quantity: -2,
        beforeOnHand: before.onHand,
        afterOnHand: before.onHand - 2,
      }),
      expect.objectContaining({
        quantity: -1,
        beforeOnHand: before.onHand - 2,
        afterOnHand: before.onHand - 3,
      }),
    ]));
  });

  it('replays concurrent identical transition keys without duplicate side effects', async () => {
    const requestId = `${requestIdPrefix}-transfer-transition-idempotency`;
    const key = `test-transfer-transition-${runId}`;
    await inventory.changeOnHand({
      warehouseId: sourceWarehouseId,
      locationId: sourceLocationId,
      variantId: transferVariantId,
      delta: 2,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId: `${requestId}-seed`,
    });
    const transfer = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [{ variantId: transferVariantId, quantity: 1, sourceLocationId, targetLocationId }],
      actorId,
      requestId: `${requestId}-create`,
    });
    const requested = await inventory.requestTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-request`,
    });
    const approved = await inventory.approveTransfer(requested.id, {
      actorId,
      requestId: `${requestId}-approve`,
    });

    const results = await Promise.all([
      inventory.dispatchTransfer(approved.id, {
        actorId,
        requestId: `${requestId}-dispatch-a`,
        idempotencyKey: key,
        expectedVersion: approved.version,
      }),
      inventory.dispatchTransfer(approved.id, {
        actorId,
        requestId: `${requestId}-dispatch-b`,
        idempotencyKey: key,
        expectedVersion: approved.version,
      }),
    ]);

    expect(results).toEqual([
      expect.objectContaining({ id: approved.id, status: 'IN_TRANSIT' }),
      expect.objectContaining({ id: approved.id, status: 'IN_TRANSIT' }),
    ]);
    await expect(prisma.stockTransferTransition.count({
      where: { idempotencyKey: key },
    })).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count({
      where: {
        referenceType: 'stock-transfer',
        referenceId: transfer.code,
        type: InventoryMovementType.TRANSFER_OUT,
      },
    })).resolves.toBe(1);
  });

  it('rejects illegal transfer transitions and records no movement', async () => {
    const requestId = `${requestIdPrefix}-transfer-illegal`;
    const transfer = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [{ variantId: transferVariantId, quantity: 1, sourceLocationId, targetLocationId }],
      actorId,
      requestId: `${requestId}-create`,
    });

    await expect(
      inventory.approveTransfer(transfer.id, { actorId, requestId: `${requestId}-approve` }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_STATE_CONFLICT' } });

    await expect(
      inventory.receiveTransfer(transfer.id, { actorId, requestId: `${requestId}-receive` }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_STATE_CONFLICT' } });

    const cancelled = await inventory.cancelTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-cancel`,
    });
    expect(cancelled.status).toBe('CANCELLED');

    await expect(
      inventory.cancelTransfer(transfer.id, { actorId, requestId: `${requestId}-cancel-again` }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_STATE_CONFLICT' } });

    const outMovements = await prisma.inventoryMovement.count({
      where: { referenceType: 'stock-transfer', referenceId: transfer.code, type: InventoryMovementType.TRANSFER_OUT },
    });
    expect(outMovements).toBe(0);
  });

  it('uses the transfer aggregate version for optimistic transition concurrency', async () => {
    const requestId = `${requestIdPrefix}-transfer-version`;
    const transfer = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [{ variantId: transferVariantId, quantity: 1, sourceLocationId, targetLocationId }],
      actorId,
      requestId: `${requestId}-create`,
    });
    expect(transfer.version).toBe(0);

    const requested = await inventory.requestTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-request`,
      expectedVersion: 0,
    });
    expect(requested).toMatchObject({ status: 'REQUESTED', version: 1 });

    await expect(
      inventory.approveTransfer(transfer.id, {
        actorId,
        requestId: `${requestId}-stale-approve`,
        expectedVersion: 0,
      }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_VERSION_CONFLICT' } });

    const unchanged = await inventory.getTransfer(transfer.id);
    expect(unchanged).toMatchObject({ status: 'REQUESTED', version: 1 });

    const approved = await inventory.approveTransfer(transfer.id, {
      actorId,
      requestId: `${requestId}-approve`,
      expectedVersion: 1,
    });
    expect(approved).toMatchObject({ status: 'APPROVED', version: 2 });
  });

  it('requires locations when dispatching and receiving', async () => {
    const requestId = `${requestIdPrefix}-transfer-no-loc`;
    const withoutLocations = await inventory.createTransfer({
      sourceWarehouseId,
      targetWarehouseId,
      items: [{ variantId: transferVariantId, quantity: 1 }],
      actorId,
      requestId: `${requestId}-create`,
    });

    const requested = await inventory.requestTransfer(withoutLocations.id, {
      actorId,
      requestId: `${requestId}-request`,
    });
    const approved = await inventory.approveTransfer(requested.id, {
      actorId,
      requestId: `${requestId}-approve`,
    });

    await expect(
      inventory.dispatchTransfer(approved.id, { actorId, requestId: `${requestId}-dispatch` }),
    ).rejects.toMatchObject({ response: { code: 'TRANSFER_ITEM_LOCATION_REQUIRED' } });

    await inventory.cancelTransfer(approved.id, { actorId, requestId: `${requestId}-cancel` });
  });

  it('replays a matching transfer for a repeated idempotency key and conflicts a mismatch', async () => {
    const key = `test-transfer-idem-${runId}`;
    const payload = {
      sourceWarehouseId,
      targetWarehouseId,
      items: [{ variantId: transferVariantId, quantity: 2, sourceLocationId, targetLocationId }] as { variantId: string; quantity: number; sourceLocationId: string; targetLocationId: string }[],
      idempotencyKey: key,
      actorId,
      requestId: `${requestIdPrefix}-transfer-idem-first`,
    };

    const first = await inventory.createTransfer(payload);
    const replay = await inventory.createTransfer(payload);

    expect(replay.id).toBe(first.id);
    await expect(
      prisma.stockTransfer.count({ where: { idempotencyKey: key } }),
    ).resolves.toBe(1);

    await expect(
      inventory.createTransfer({
        ...payload,
        items: [{ variantId: transferVariantId, quantity: 99, sourceLocationId, targetLocationId }],
        requestId: `${requestIdPrefix}-transfer-idem-second`,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a single dispatch winner when two identical transfers race', async () => {
    const requestId = `${requestIdPrefix}-transfer-race`;
    await inventory.changeOnHand({
      warehouseId: sourceWarehouseId,
      locationId: sourceLocationId,
      variantId: transferVariantId,
      delta: 5,
      type: InventoryMovementType.RECEIPT,
      actorId,
      requestId: `${requestId}-seed`,
    });

    const createTransfer = async (): Promise<string> => {
      const transfer = await inventory.createTransfer({
        sourceWarehouseId,
        targetWarehouseId,
        items: [{ variantId: transferVariantId, quantity: 3, sourceLocationId, targetLocationId }],
        actorId,
        requestId: `${requestId}-create`,
      });
      await inventory.requestTransfer(transfer.id, { actorId, requestId: `${requestId}-request` });
      await inventory.approveTransfer(transfer.id, { actorId, requestId: `${requestId}-approve` });
      return transfer.id;
    };

    const a = await createTransfer();
    const b = await createTransfer();
    void b;

    const outBefore = await prisma.inventoryMovement.count({
      where: { type: InventoryMovementType.TRANSFER_OUT, variantId: transferVariantId },
    });
    const inTransitBefore = await prisma.stockTransfer.count({
      where: { status: 'IN_TRANSIT', sourceWarehouseId },
    });

    const results = await Promise.allSettled([
      inventory.dispatchTransfer(a, { actorId, requestId: `${requestId}-dispatch-a` }),
      inventory.dispatchTransfer(b, { actorId, requestId: `${requestId}-dispatch-b` }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    for (const r of rejected) {
      expect(r.reason).toBeInstanceOf(ConflictException);
    }

    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId: sourceWarehouseId, locationId: sourceLocationId, variantId: transferVariantId } },
    });
    const seedBalance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId: sourceWarehouseId, locationId: sourceLocationId, variantId: transferVariantId } },
    });
    expect(balance.onHand).toBe(seedBalance.onHand);

    const outDrift = (await prisma.inventoryMovement.count({
      where: { type: InventoryMovementType.TRANSFER_OUT, variantId: transferVariantId },
    })) - outBefore;
    const inTransitDrift = (await prisma.stockTransfer.count({
      where: { status: 'IN_TRANSIT', sourceWarehouseId },
    })) - inTransitBefore;
    expect(outDrift).toBe(inTransitDrift);
  });
});
