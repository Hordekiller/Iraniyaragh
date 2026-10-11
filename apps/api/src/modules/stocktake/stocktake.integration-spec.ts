import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { canonicalizeSku, combinationSignature } from '../catalog/variant-identifiers';
import { InventoryService } from '../inventory/inventory.service';
import { MAX_STOCKTAKE_LINES, StocktakeService, type StocktakeContext } from './stocktake.service';

describe.sequential('Stocktake atomic ledger and durable replay integration', () => {
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const service = new StocktakeService(prisma, audit);
  const inventory = new InventoryService(prisma, audit);
  const run = randomUUID().replaceAll('-', '');
  const warehouses: string[] = [];
  const products: string[] = [];
  let actorId = '';
  let connected = false;
  let sequence = 0;
  const context = (canApprove = true, key = `stocktake-${run}-${sequence++}`): StocktakeContext => ({
    actorId, canApprove, idempotencyKey: key, requestId: `stocktake-it-${run}`,
  });
  const code = (expected: string) => expect.objectContaining({ response: expect.objectContaining({ code: expected }) });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    actorId = (await prisma.user.create({ data: { email: `stocktake-${run}@iranyaragh.test`, status: 'ACTIVE' } })).id;
  });
  afterAll(async () => {
    if (!connected) return;
    await prisma.stocktakeCommandRecord.deleteMany({ where: { actorId } });
    await prisma.stocktakeItem.deleteMany({ where: { stocktake: { warehouseId: { in: warehouses } } } });
    await prisma.stocktake.deleteMany({ where: { warehouseId: { in: warehouses } } });
    await prisma.stockReservation.deleteMany({ where: { warehouseId: { in: warehouses } } });
    await prisma.inventoryMovement.deleteMany({ where: { warehouseId: { in: warehouses } } });
    await prisma.inventoryBalance.deleteMany({ where: { warehouseId: { in: warehouses } } });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId: { in: warehouses } } });
    await prisma.warehouse.deleteMany({ where: { id: { in: warehouses } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: products } } });
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.auditLog.deleteMany({ where: { actorId } });
    await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  async function fixture(quantities = [10, 20], reserved = quantities.map(() => 0)) {
    const identity = `${run}-${sequence++}`;
    const warehouse = await prisma.warehouse.create({ data: { code: `ST-${identity}`, name: 'Isolated stocktake test warehouse' } });
    warehouses.push(warehouse.id);
    const location = await prisma.warehouseLocation.create({ data: { warehouseId: warehouse.id, code: `LOC-${identity}` } });
    const product = await prisma.product.create({ data: { slug: `stocktake-it-${identity}`, name: 'Isolated stocktake test product' } });
    products.push(product.id);
    const variants = quantities.map((_, index) => ({ id: `variant-${identity}-${index}`, productId: product.id,
      sku: `ST-SKU-${identity}-${index}`, skuKey: canonicalizeSku(`ST-SKU-${identity}-${index}`),
      combinationSignature: combinationSignature([{ attributeId: 'test-axis', optionId: String(index) }]),
      costPrice: 1000n, salePrice: 1500n }));
    await prisma.productVariant.createMany({ data: variants });
    await prisma.inventoryBalance.createMany({ data: variants.map((variant, index) => ({ warehouseId: warehouse.id,
      locationId: location.id, variantId: variant.id, onHand: quantities[index], reserved: reserved[index],
      available: quantities[index] - reserved[index] })) });
    return { warehouseId: warehouse.id, locationId: location.id, variants };
  }
  async function counting(data: Awaited<ReturnType<typeof fixture>>, canApprove = true) {
    const draft = await service.create({ warehouseId: data.warehouseId }, context(canApprove));
    return service.start(draft.id, { expectedVersion: draft.version }, context(canApprove));
  }
  async function review(data: Awaited<ReturnType<typeof fixture>>, counts: number[]) {
    const started = await counting(data);
    const counted = await service.count(started.id, { expectedVersion: started.version,
      lines: started.lines.map(line => ({ locationId: line.locationId, variantId: line.variantId,
        countedQty: counts[data.variants.findIndex(variant => variant.id === line.variantId)] })) }, context());
    return service.submit(counted.id, { expectedVersion: counted.version }, context());
  }
  const balance = (data: Awaited<ReturnType<typeof fixture>>, index = 0) => prisma.inventoryBalance.findUniqueOrThrow({
    where: { warehouseId_locationId_variantId: { warehouseId: data.warehouseId, locationId: data.locationId, variantId: data.variants[index].id } },
  });

  it('keeps draft creation durable and rejects key reuse with different payload', async () => {
    const data = await fixture();
    const ctx = context();
    const draft = await service.create({ warehouseId: data.warehouseId }, ctx);
    const restarted = new StocktakeService(prisma, audit);
    expect(await restarted.create({ warehouseId: data.warehouseId }, ctx)).toEqual(draft);
    expect(await prisma.stocktake.count({ where: { warehouseId: data.warehouseId } })).toBe(1);
    await expect(service.create({ warehouseId: data.warehouseId, notes: 'Changed' }, ctx)).rejects.toEqual(code('IDEMPOTENCY_CONFLICT'));
  });

  it('pins location/SKU scope, includes unpublished physical stock and rejects cross-warehouse locations', async () => {
    const data = await fixture();
    const other = await fixture();
    await expect(service.create({ warehouseId: data.warehouseId, scopeType: 'LOCATIONS', locationIds: [other.locationId] }, context()))
      .rejects.toEqual(code('LOCATION_INACTIVE'));
    await expect(service.create({ warehouseId: data.warehouseId, locationIds: [data.locationId] }, context())).rejects.toEqual(code('VALIDATION_ERROR'));
    const draft = await service.create({ warehouseId: data.warehouseId, scopeType: 'VARIANTS', variantIds: [data.variants[0].id] }, context());
    const started = await service.start(draft.id, { expectedVersion: 0 }, context());
    expect(started.lines.map(line => line.variantId)).toEqual([data.variants[0].id]);
    expect(started.lines[0].expectedQty).toBe(10);
  });

  it('rejects empty and oversized sheets without changing draft state', async () => {
    const empty = await fixture([0]);
    const draft = await service.create({ warehouseId: empty.warehouseId }, context());
    await expect(service.start(draft.id, { expectedVersion: 0 }, context())).rejects.toEqual(code('STOCKTAKE_LINE_REQUIRED'));
    expect((await service.get(draft.id, context())).status).toBe('DRAFT');
    const large = await fixture(Array.from({ length: MAX_STOCKTAKE_LINES + 1 }, () => 1));
    const oversized = await service.create({ warehouseId: large.warehouseId }, context());
    await expect(service.start(oversized.id, { expectedVersion: 0 }, context())).rejects.toEqual(code('STOCKTAKE_SCOPE_TOO_LARGE'));
    expect((await service.get(oversized.id, context())).lines).toHaveLength(0);
    expect((await service.get(oversized.id, context())).version).toBe(0);
  });

  it('redacts blind reads AND cached replays according to current permissions after restart', async () => {
    const data = await fixture();
    const draft = await service.create({ warehouseId: data.warehouseId }, context());
    const ctx = context();
    const started = await service.start(draft.id, { expectedVersion: 0 }, ctx);
    expect(started.lines[0]).toHaveProperty('expectedQty');
    const restarted = new StocktakeService(prisma, audit);
    const replay = await restarted.start(draft.id, { expectedVersion: 0 }, { ...ctx, canApprove: false });
    for (const line of replay.lines) { expect(line).not.toHaveProperty('expectedQty'); expect(line).not.toHaveProperty('difference'); }
    expect(replay.summary).not.toHaveProperty('netDifference');
    const blind = await restarted.get(draft.id, context(false));
    expect(blind.lines[0]).not.toHaveProperty('expectedQty');
    expect((await restarted.list({ offset: 0, limit: 20 }, context(false))).items.every(item => !('netDifference' in item.summary))).toBe(true);
    expect(await prisma.stocktakeItem.count({ where: { stocktakeId: draft.id } })).toBe(2);
  });

  it('requires complete counts before review, accepts partial batches, and freezes review', async () => {
    const data = await fixture();
    const started = await counting(data, false);
    await expect(service.submit(started.id, { expectedVersion: started.version }, context())).rejects.toEqual(code('STOCKTAKE_NOT_FULLY_COUNTED'));
    const first = await service.count(started.id, { expectedVersion: started.version,
      lines: [{ locationId: data.locationId, variantId: data.variants[0].id, countedQty: 0 }] }, context(false));
    expect(first.summary.pendingLines).toBe(1);
    expect(first.lines[0]).not.toHaveProperty('difference');
    const second = await service.count(started.id, { expectedVersion: first.version,
      lines: [{ locationId: data.locationId, variantId: data.variants[1].id, countedQty: 20 }] }, context());
    const submitted = await service.submit(started.id, { expectedVersion: second.version }, context());
    await expect(service.count(started.id, { expectedVersion: submitted.version,
      lines: [{ locationId: data.locationId, variantId: data.variants[0].id, countedQty: 2 }] }, context()))
      .rejects.toEqual(code('STOCKTAKE_STATE_CONFLICT'));
  });

  it('rejects out-of-scope, duplicate, negative, fractional and overflowing counts atomically', async () => {
    const data = await fixture();
    const started = await counting(data);
    const line = { locationId: data.locationId, variantId: data.variants[0].id, countedQty: 8 };
    for (const quantity of [-1, 1.5, 2_147_483_648]) {
      await expect(service.count(started.id, { expectedVersion: started.version, lines: [{ ...line, countedQty: quantity }] }, context()))
        .rejects.toEqual(code('VALIDATION_ERROR'));
    }
    await expect(service.count(started.id, { expectedVersion: started.version, lines: [line, line] }, context())).rejects.toEqual(code('STOCKTAKE_LINE_CONFLICT'));
    await expect(service.count(started.id, { expectedVersion: started.version, lines: [line, { ...line, variantId: 'missing' }] }, context()))
      .rejects.toEqual(code('STOCKTAKE_OUT_OF_SCOPE'));
    expect((await service.get(started.id, context())).summary.countedLines).toBe(0);
  });

  it('posts exact signed live deltas once, audits the actor/reason and keeps completed sheets immutable', async () => {
    const data = await fixture();
    const submitted = await review(data, [7, 25]);
    const ctx = context();
    const input = { expectedVersion: submitted.version };
    const results = await Promise.all([service.approve(submitted.id, input, ctx), service.approve(submitted.id, input, ctx)]);
    expect(results[0]).toEqual(results[1]);
    expect((await new StocktakeService(prisma, audit).approve(submitted.id, input, ctx))).toEqual(results[0]);
    expect((await balance(data)).onHand).toBe(7);
    const movements = await prisma.inventoryMovement.findMany({ where: { warehouseId: data.warehouseId, type: 'STOCKTAKE' }, orderBy: { variantId: 'asc' } });
    expect(movements.map(movement => movement.quantity)).toEqual([-3, 5]);
    expect(movements.every(movement => movement.reason?.includes(submitted.number) && movement.referenceType === 'StocktakeItem')).toBe(true);
    expect(results[0].lines.every(line => line.movementId)).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityType: 'Stocktake', entityId: submitted.id, action: 'stocktake.approved', actorId } })).toBe(1);
    await expect(service.approve(submitted.id, { expectedVersion: results[0].version }, context())).rejects.toEqual(code('STOCKTAKE_STATE_CONFLICT'));
    await expect(service.cancel(submitted.id, { expectedVersion: results[0].version }, context())).rejects.toEqual(code('STOCKTAKE_STATE_CONFLICT'));
  });

  it('uses live balance instead of snapshot variance, including zero snapshot variance with a movement', async () => {
    const data = await fixture([10]);
    const submitted = await review(data, [10]);
    const before = await balance(data);
    await inventory.changeOnHand({ warehouseId: data.warehouseId, locationId: data.locationId, variantId: data.variants[0].id,
      type: 'ADJUSTMENT_OUT', delta: -5, expectedVersion: before.version, reason: 'Isolated test movement during count',
      actorId, requestId: `stocktake-it-${run}`, idempotencyKey: `concurrent-${run}-${sequence++}` });
    const approved = await service.approve(submitted.id, { expectedVersion: submitted.version }, context());
    expect(approved.lines[0].difference).toBe(0);
    expect(approved.lines[0].movementId).toBeTruthy();
    const movement = await prisma.inventoryMovement.findUniqueOrThrow({ where: { id: approved.lines[0].movementId! } });
    expect([movement.beforeOnHand, movement.afterOnHand, movement.quantity]).toEqual([5, 10, 5]);
  });

  it('does not post a zero-delta movement or mutate an unchanged balance version', async () => {
    const data = await fixture([10]);
    const submitted = await review(data, [8]);
    const before = await balance(data);
    await inventory.changeOnHand({ warehouseId: data.warehouseId, locationId: data.locationId, variantId: data.variants[0].id,
      type: 'ADJUSTMENT_OUT', delta: -2, expectedVersion: before.version, reason: 'Isolated count-time movement',
      actorId, requestId: `stocktake-it-${run}`, idempotencyKey: `zero-${run}-${sequence++}` });
    const live = await balance(data);
    const approved = await service.approve(submitted.id, { expectedVersion: submitted.version }, context());
    expect(approved.lines[0].difference).toBe(-2);
    expect(approved.lines[0].movementId).toBeNull();
    expect(await balance(data)).toEqual(live);
    expect(await prisma.inventoryMovement.count({ where: { warehouseId: data.warehouseId, type: 'STOCKTAKE' } })).toBe(0);
  });

  it('rolls back ALL lines when one count falls below live reservations', async () => {
    const data = await fixture([10, 20], [0, 5]);
    const submitted = await review(data, [7, 4]);
    const original = await Promise.all([balance(data), balance(data, 1)]);
    const ctx = context();
    await expect(service.approve(submitted.id, { expectedVersion: submitted.version }, ctx)).rejects.toEqual(code('STOCKTAKE_RESERVED_EXCEEDS_COUNT'));
    expect(await Promise.all([balance(data), balance(data, 1)])).toEqual(original);
    expect(await prisma.inventoryMovement.count({ where: { warehouseId: data.warehouseId } })).toBe(0);
    expect((await service.get(submitted.id, context())).status).toBe('REVIEW');
    expect(await prisma.stocktakeCommandRecord.count({ where: { actorId, scope: `approve:${submitted.id}` } })).toBe(0);
  });

  it('serializes competing approvals and cancellations using versioned state', async () => {
    const data = await fixture([10]);
    const submitted = await review(data, [9]);
    const results = await Promise.allSettled([
      service.approve(submitted.id, { expectedVersion: submitted.version }, context()),
      service.cancel(submitted.id, { expectedVersion: submitted.version }, context()),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const final = await service.get(submitted.id, context());
    expect(['COMPLETED', 'CANCELLED']).toContain(final.status);
    expect(await prisma.inventoryMovement.count({ where: { warehouseId: data.warehouseId, type: 'STOCKTAKE' } })).toBe(final.status === 'COMPLETED' ? 1 : 0);
    expect((await balance(data)).onHand).toBe(final.status === 'COMPLETED' ? 9 : 10);
  });

  it('rejects stale versions and counts after cancellation without ledger writes', async () => {
    const data = await fixture();
    const started = await counting(data);
    await expect(service.cancel(started.id, { expectedVersion: 0 }, context())).rejects.toEqual(code('STOCKTAKE_VERSION_CONFLICT'));
    const cancelled = await service.cancel(started.id, { expectedVersion: started.version }, context());
    expect(cancelled.status).toBe('CANCELLED');
    await expect(service.submit(started.id, { expectedVersion: cancelled.version }, context())).rejects.toEqual(code('STOCKTAKE_STATE_CONFLICT'));
    expect(await prisma.inventoryMovement.count({ where: { warehouseId: data.warehouseId } })).toBe(0);
  });

  it('uses the same balance lock as reservation commands and preserves nonnegative availability', async () => {
    const data = await fixture([10]);
    const submitted = await review(data, [4]);
    const before = await balance(data);
    const results = await Promise.allSettled([
      service.approve(submitted.id, { expectedVersion: submitted.version }, context()),
      inventory.reserve({ warehouseId: data.warehouseId, locationId: data.locationId, variantId: data.variants[0].id,
        quantity: 5, expiresAt: new Date(Date.now() + 60_000), expectedVersion: before.version,
        actorId, requestId: `stocktake-it-${run}`, idempotencyKey: `reserve-${run}-${sequence++}` }),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const final = await balance(data);
    expect(final.available).toBe(final.onHand - final.reserved);
    expect(final.available).toBeGreaterThanOrEqual(0);
    const status = (await service.get(submitted.id, context())).status;
    expect([final.onHand, final.reserved]).toEqual(status === 'COMPLETED' ? [4, 0] : [10, 5]);
  });

  it('supports the full inventory integer range without precision loss', async () => {
    const data = await fixture([2_147_483_647]);
    const submitted = await review(data, [0]);
    const completed = await service.approve(submitted.id, { expectedVersion: submitted.version }, context());
    const movement = await prisma.inventoryMovement.findUniqueOrThrow({ where: { id: completed.lines[0].movementId! } });
    expect(movement.quantity).toBe(-2_147_483_647);
    expect((await balance(data)).onHand).toBe(0);
  });

  it('approves the maximum bounded sheet atomically and reports paginated totals independently of page size', async () => {
    const data = await fixture(Array.from({ length: MAX_STOCKTAKE_LINES }, () => 1));
    const submitted = await review(data, Array.from({ length: MAX_STOCKTAKE_LINES }, () => 2));
    const completed = await service.approve(submitted.id, { expectedVersion: submitted.version }, context());
    expect(completed.lines).toHaveLength(MAX_STOCKTAKE_LINES);
    expect(await prisma.inventoryMovement.count({ where: { warehouseId: data.warehouseId, type: 'STOCKTAKE' } })).toBe(MAX_STOCKTAKE_LINES);
    expect((await service.history(completed.id, { offset: 0, limit: 1 })).count).toBe(5);
    const page = await service.list({ warehouseId: data.warehouseId, offset: 1, limit: 1 }, context(false));
    expect(page.items).toHaveLength(0); expect(page.count).toBe(1);
  });
});
