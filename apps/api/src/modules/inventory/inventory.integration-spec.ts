import { randomUUID } from 'node:crypto';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { InventoryService } from './inventory.service';

describe.sequential('InventoryService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const warehouseId = `test_warehouse_${runId}`;
  const locationId = `test_location_${runId}`;
  const productId = `test_product_${runId}`;
  const variantId = `test_variant_${runId}`;
  const idempotencyKey = `test_adjustment_${runId}`;
  const prisma = new PrismaService();
  const inventory = new InventoryService(prisma);
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
        costPrice: '100000',
        salePrice: '120000',
      },
    });
  });

  afterAll(async () => {
    if (!connected) return;

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
});
