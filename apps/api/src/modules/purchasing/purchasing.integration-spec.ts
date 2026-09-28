import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { PurchasingService } from './purchasing.service';

describe.sequential('PurchasingService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const requestId = `po-it-${runId}`;
  const supplierId = `po-supplier-${runId}`;
  const warehouseId = `po-wh-${runId}`;
  const productId = `po-product-${runId}`;
  const variantId = `po-variant-${runId}`;
  const prisma = new PrismaService();
  const service = new PurchasingService(prisma, new AuditLogService(prisma));
  let actorId = '';
  const orderIds: string[] = [];
  const context = (key: string) => ({ actorId, requestId, idempotencyKey: `purchase-${key}-${runId}` });
  const input = () => ({ supplierId, warehouseId, expectedAt: '2026-10-20T00:00:00.000Z', notes: 'First batch',
    items: [{ variantId, orderedQty: 3, unitCost: '120000' }] });

  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect();
    const actor = await prisma.user.create({ data: { mobile: `+989${runId.replace(/\D/g, '').padStart(9, '0').slice(0, 9)}`,
      status: 'ACTIVE', isMobileVerified: true, createdAt: new Date(Date.now() - 60_000), mobileVerifiedAt: new Date() } });
    actorId = actor.id;
    await prisma.supplier.create({ data: { id: supplierId, code: `PO-SUP-${runId.toUpperCase()}`, name: 'Purchase Supplier' } });
    await prisma.warehouse.create({ data: { id: warehouseId, code: `PO-WH-${runId.toUpperCase()}`, name: 'Purchase Warehouse' } });
    await prisma.product.create({ data: { id: productId, slug: `po-product-${runId}`, name: 'Purchase Product', status: 'ACTIVE' } });
    await prisma.productVariant.create({ data: { id: variantId, productId, sku: `PO-SKU-${runId.toUpperCase()}`,
      skuKey: canonicalizeSku(`PO-SKU-${runId.toUpperCase()}`), combinationSignature: EMPTY_AXIS_SIGNATURE,
      status: 'ACTIVE', isActive: true, costPrice: 120000n, salePrice: 150000n } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId } });
    await prisma.purchaseOrderCommandRecord.deleteMany({ where: { actorId } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    if (actorId) await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });

  it('creates once across concurrent retries with exact integer IRR cost and no stock movement', async () => {
    const beforeMovements = await prisma.inventoryMovement.count();
    const [first, replay] = await Promise.all([service.create(input(), context('create')), service.create(input(), context('create'))]);
    orderIds.push(first.id);
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ status: 'DRAFT', version: 0, totalCost: '360000', items: [{ orderedQty: 3, receivedQty: 0, unitCost: '120000' }] });
    expect(await prisma.purchaseOrder.count({ where: { id: first.id } })).toBe(1);
    expect(await prisma.inventoryMovement.count()).toBe(beforeMovements);
    await expect(service.create({ ...input(), notes: 'Changed' }, context('create'))).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('guards duplicate lines, invalid amounts and inactive references without partial writes', async () => {
    await expect(service.create({ ...input(), items: [input().items[0], input().items[0]] }, context('duplicate'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input(), items: [{ variantId, orderedQty: 1, unitCost: '9223372036854775808' }] }, context('overflow'))).rejects.toBeInstanceOf(BadRequestException);
    await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
    await expect(service.create(input(), context('inactive'))).rejects.toMatchObject({ response: { code: 'SUPPLIER_INACTIVE' } });
    await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: true } });
    expect(await prisma.purchaseOrder.count({ where: { supplierId } })).toBe(1);
  });

  it('edits only a version-matched draft, approves immutable lines, then cancels an unreceived order', async () => {
    const id = orderIds[0];
    const updated = await service.update(id, { expectedVersion: 0, notes: 'Revised batch', items: [{ variantId, orderedQty: 4, unitCost: '130000' }] }, context('edit'));
    expect(updated).toMatchObject({ version: 1, totalCost: '520000', notes: 'Revised batch' });
    expect(await service.update(id, { expectedVersion: 0, notes: 'Revised batch', items: [{ variantId, orderedQty: 4, unitCost: '130000' }] }, context('edit'))).toEqual(updated);
    await expect(service.update(id, { expectedVersion: 0, notes: 'Stale' }, context('stale'))).rejects.toBeInstanceOf(ConflictException);
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    await expect(service.approve(id, { expectedVersion: 1 }, context('inactive-approve'))).rejects.toMatchObject({ response: { code: 'VARIANT_INACTIVE' } });
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: true } });
    const approved = await service.approve(id, { expectedVersion: 1 }, context('approve'));
    expect(approved).toMatchObject({ status: 'APPROVED', version: 2, totalCost: '520000' });
    await expect(service.update(id, { expectedVersion: 2, notes: 'After approval' }, context('immutable'))).rejects.toMatchObject({ response: { code: 'PURCHASE_ORDER_STATE_CONFLICT' } });
    await expect(prisma.purchaseOrderItem.update({ where: { purchaseOrderId_variantId: { purchaseOrderId: id, variantId } }, data: { receivedQty: 5 } })).rejects.toThrow();
    await expect(prisma.purchaseOrderItem.update({ where: { purchaseOrderId_variantId: { purchaseOrderId: id, variantId } }, data: { unitCost: 0n } })).rejects.toThrow();
    await prisma.purchaseOrderItem.update({ where: { purchaseOrderId_variantId: { purchaseOrderId: id, variantId } }, data: { receivedQty: 1 } });
    await expect(service.cancel(id, { expectedVersion: 2 }, context('received-cancel'))).rejects.toMatchObject({ response: { code: 'PURCHASE_ORDER_STATE_CONFLICT' } });
    await prisma.purchaseOrderItem.update({ where: { purchaseOrderId_variantId: { purchaseOrderId: id, variantId } }, data: { receivedQty: 0 } });
    const cancelled = await service.cancel(id, { expectedVersion: 2 }, context('cancel'));
    expect(cancelled).toMatchObject({ status: 'CANCELLED', version: 3 });
    await expect(service.approve(id, { expectedVersion: 3 }, context('reapprove'))).rejects.toBeInstanceOf(ConflictException);
    const history = await service.history(id, { offset: 0, limit: 50 });
    expect(history.items.map(row => row.action)).toEqual(['purchase-order.cancelled', 'purchase-order.approved', 'purchase-order.updated', 'purchase-order.created']);
    expect((await service.list({ offset: 0, limit: 50, status: 'CANCELLED' })).items.some(row => row.id === id)).toBe(true);
  });

  it('allows only one simultaneous draft edit and preserves a single audit event', async () => {
    const draft = await service.create(input(), context('race-create'));
    orderIds.push(draft.id);
    const attempts = await Promise.allSettled([
      service.update(draft.id, { expectedVersion: 0, notes: 'A' }, context('race-a')),
      service.update(draft.id, { expectedVersion: 0, notes: 'B' }, context('race-b')),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await service.get(draft.id)).version).toBe(1);
    expect(await prisma.auditLog.count({ where: { requestId, entityId: draft.id, action: 'purchase-order.updated' } })).toBe(1);
  });
});
