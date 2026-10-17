import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from './inventory.service';

describe.sequential('Reservation expiry batching against PostgreSQL', () => {
  const prefix = `expiry_test_${randomUUID().replaceAll('-', '')}`;
  const prisma = new PrismaService({ log: [{ emit: 'event', level: 'query' }] });
  const auditLog = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, auditLog);
  const now = new Date('2026-01-01T00:00:00.000Z');
  const warehouseId = `${prefix}_wh`;
  const locationId = `${prefix}_loc`;
  const productId = `${prefix}_product`;
  let actorId: string;
  let connected = false;
  let measuredQueries: string[] | undefined;

  // PrismaService's base type does not infer the constructor's event-log option.
  const onQuery = prisma.$on.bind(prisma) as (
    event: 'query', callback: (event: Prisma.QueryEvent) => void,
  ) => void;
  onQuery('query', (event) => { measuredQueries?.push(event.query); });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    connected = true;
    const actor = await prisma.user.create({ data: { status: 'ACTIVE', email: `${prefix}@example.invalid` } });
    actorId = actor.id;
    await prisma.warehouse.create({ data: { id: warehouseId, code: warehouseId, name: 'Expiry test warehouse' } });
    await prisma.warehouseLocation.create({ data: { id: locationId, warehouseId, code: locationId, name: 'Expiry test location' } });
    await prisma.product.create({ data: { id: productId, name: 'Isolated expiry fixture', slug: productId } });
  });

  afterAll(async () => {
    if (!connected) return;
    measuredQueries = undefined;
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: prefix } } });
    await prisma.stockReservation.deleteMany({ where: { warehouseId } });
    await prisma.inventoryMovement.deleteMany({ where: { warehouseId } });
    await prisma.inventoryBalance.deleteMany({ where: { warehouseId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.warehouseLocation.deleteMany({ where: { id: locationId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  async function fixture(count: number, groups = 1) {
    const id = `${prefix}_${randomUUID()}`;
    const variants = Array.from({ length: groups }, (_, index) => ({
      id: `${id}_v${index}`, productId, sku: `${id}_sku${index}`, skuKey: `${id}_SKU${index}`,
      combinationSignature: `${id}_${index}`, title: 'Isolated expiry SKU', costPrice: 0n, salePrice: 100000n,
    }));
    await prisma.productVariant.createMany({ data: variants });
    await prisma.inventoryBalance.createMany({ data: variants.map((variant, index) => {
      const quantity = Math.floor(count / groups) + (index < count % groups ? 1 : 0);
      return { warehouseId, locationId, variantId: variant.id, onHand: quantity, reserved: quantity, available: 0 };
    }) });
    const rows = Array.from({ length: count }, (_, index) => ({
      id: `${id}_r${String(index).padStart(3, '0')}`, warehouseId, locationId,
      variantId: variants[index % groups].id, quantity: 1, expiresAt: now,
    }));
    await prisma.stockReservation.createMany({ data: rows });
    return { rows, variants, requestId: id };
  }

  it.each([1, 10, 100])('measures and preserves every audit fact for %i reservations sharing one balance', async (count) => {
    const data = await fixture(count);
    measuredQueries = [];
    let queries: string[];
    try {
      expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now, batchSize: count })).toBe(count);
      queries = measuredQueries;
    } finally {
      measuredQueries = undefined;
    }
    const transactionQueries = queries.filter((query) => /^(BEGIN|COMMIT|SET TRANSACTION)/.test(query));
    process.stdout.write(`${JSON.stringify({ path: 'reservation-expiry', count, groups: 1, statements: queries.length, transactionStatements: transactionQueries.length })}\n`);
    expect(queries.length).toBeLessThanOrEqual(10);
    const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } });
    expect(balance).toMatchObject({ onHand: count, reserved: 0, available: count, version: count });
    expect(await prisma.stockReservation.count({ where: { id: { in: data.rows.map((row) => row.id) }, status: 'EXPIRED' } })).toBe(count);
    const audits = await prisma.auditLog.findMany({ where: { requestId: data.requestId } });
    expect(audits).toHaveLength(count);
    for (let index = 0; index < count; index += 1) {
      expect(audits.find((audit) => audit.entityId === data.rows[index].id)).toMatchObject({
        action: 'inventory.reservation.expired', entityType: 'stock-reservation', actorId,
        before: { reserved: count - index, available: index }, after: { reserved: count - index - 1, available: index + 1 },
      });
    }
    expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now })).toBe(0);
    expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(count);
  });

  it.each([10, 100])('measures %i distinct balance keys without dropping reservation evidence', async (count) => {
    const data = await fixture(count, count);
    measuredQueries = [];
    try {
      expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now, batchSize: count })).toBe(count);
      process.stdout.write(`${JSON.stringify({ path: 'reservation-expiry', count, groups: count, statements: measuredQueries.length, transactionStatements: measuredQueries.filter((query) => /^(BEGIN|COMMIT|SET TRANSACTION)/.test(query)).length })}\n`);
      expect(measuredQueries.length).toBeLessThanOrEqual(2 * count + 8);
    } finally {
      measuredQueries = undefined;
    }
    expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(count);
    const balances = await prisma.inventoryBalance.findMany({ where: { variantId: { in: data.variants.map((variant) => variant.id) } } });
    expect(balances).toHaveLength(count);
    for (const balance of balances) expect(balance).toMatchObject({ onHand: 1, reserved: 0, available: 1, version: 1 });
  });

  it('finalizes a shared batch exactly once across two simultaneous workers', async () => {
    const data = await fixture(10);
    const results = await Promise.all([
      inventory.expireReservations({ actorId, requestId: data.requestId }, { now }),
      inventory.expireReservations({ actorId, requestId: data.requestId }, { now }),
    ]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(10);
    expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(10);
    expect(await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } }))
      .toMatchObject({ reserved: 0, available: 10, onHand: 10, version: 10 });
  });

  it('respects the page limit and leaves future reservations active', async () => {
    const data = await fixture(3);
    const future = new Date(now.getTime() + 60_000);
    await prisma.stockReservation.update({ where: { id: data.rows[2].id }, data: { expiresAt: future } });
    expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now, batchSize: 1 })).toBe(1);
    expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now, batchSize: 1 })).toBe(1);
    expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now })).toBe(0);
    expect(await prisma.stockReservation.findUniqueOrThrow({ where: { id: data.rows[2].id } })).toMatchObject({ status: 'ACTIVE' });
    expect(await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } })).toMatchObject({ reserved: 1, available: 2 });
    // This isolated fixture must not become a candidate in subsequent cases.
    await prisma.stockReservation.delete({ where: { id: data.rows[2].id } });
  });

  it('rolls back the entire batch on a genuine aggregate balance inconsistency', async () => {
    const data = await fixture(2);
    await prisma.inventoryBalance.updateMany({ where: { variantId: data.variants[0].id }, data: { reserved: 1, available: 1 } });
    try {
      await expect(inventory.expireReservations({ actorId, requestId: data.requestId }, { now }))
        .rejects.toMatchObject({ response: { code: 'RESERVATION_STATE_CONFLICT' } });
      expect(await prisma.stockReservation.count({ where: { id: { in: data.rows.map((row) => row.id) }, status: 'ACTIVE' } })).toBe(2);
      expect(await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } })).toMatchObject({ reserved: 1, available: 1, version: 0 });
      expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(0);
    } finally {
      await prisma.stockReservation.deleteMany({ where: { id: { in: data.rows.map((row) => row.id) } } });
    }
  });

  it('rolls back balance and terminal updates if the audit write fails', async () => {
    const data = await fixture(2);
    const failure = vi.spyOn(auditLog, 'recordMany').mockRejectedValueOnce(new Error('Isolated audit-write failure'));
    try {
      await expect(inventory.expireReservations({ actorId, requestId: data.requestId }, { now })).rejects.toThrow('Isolated audit-write failure');
      expect(await prisma.stockReservation.count({ where: { id: { in: data.rows.map((row) => row.id) }, status: 'ACTIVE' } })).toBe(2);
      expect(await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } })).toMatchObject({ reserved: 2, available: 0, version: 0 });
      expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(0);
    } finally {
      failure.mockRestore();
    }
    expect(await inventory.expireReservations({ actorId, requestId: data.requestId }, { now })).toBe(2);
  });

  it.each([1, 2, 3])('serializes expiry against a stock-consuming finalizer (run %i)', async () => {
    const data = await fixture(1);
    const deadline = new Date(Date.now() + 60_000);
    await prisma.stockReservation.update({ where: { id: data.rows[0].id }, data: { expiresAt: deadline } });
    const results = await Promise.allSettled([
      inventory.expireReservations({ actorId, requestId: data.requestId }, { now: deadline }),
      inventory.consumeReservation(data.rows[0].id, { actorId, requestId: data.requestId }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    if (results[1].status === 'rejected') {
      expect(results[1].reason).toMatchObject({ response: { code: expect.stringMatching(/^RESERVATION_(EXPIRED|STATE_CONFLICT)$/) } });
    }
    const reservation = await prisma.stockReservation.findUniqueOrThrow({ where: { id: data.rows[0].id } });
    expect(['EXPIRED', 'CONSUMED']).toContain(reservation.status);
    const onHand = reservation.status === 'CONSUMED' ? 0 : 1;
    expect(await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: data.variants[0].id } }))
      .toMatchObject({ reserved: 0, available: onHand, onHand, version: 1 });
    expect(await prisma.auditLog.count({ where: { requestId: data.requestId } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { variantId: data.variants[0].id, type: 'SALE' } })).toBe(1 - onHand);
  });
});
