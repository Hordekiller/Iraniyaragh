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
  const locationId = `po-loc-${runId}`;
  const secondLocationId = `po-loc-2-${runId}`;
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
    await prisma.warehouseLocation.create({ data: { id: locationId, warehouseId, code: 'RECEIVING', name: 'Receiving' } });
    await prisma.warehouseLocation.create({ data: { id: secondLocationId, warehouseId, code: 'OVERFLOW', name: 'Overflow' } });
    await prisma.product.create({ data: { id: productId, slug: `po-product-${runId}`, name: 'Purchase Product', status: 'ACTIVE' } });
    await prisma.productVariant.create({ data: { id: variantId, productId, sku: `PO-SKU-${runId.toUpperCase()}`,
      skuKey: canonicalizeSku(`PO-SKU-${runId.toUpperCase()}`), combinationSignature: EMPTY_AXIS_SIGNATURE,
      status: 'ACTIVE', isActive: true, costPrice: 120000n, salePrice: 150000n } });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { requestId } });
    await prisma.purchaseOrderCommandRecord.deleteMany({ where: { actorId } });
    await prisma.purchaseReceiptLine.deleteMany({ where: { receipt: { purchaseOrderId: { in: orderIds } } } });
    await prisma.purchaseReceipt.deleteMany({ where: { purchaseOrderId: { in: orderIds } } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceType: 'PurchaseReceiptLine', warehouseId } });
    await prisma.inventoryBalance.deleteMany({ where: { warehouseId } });
    await prisma.purchaseOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.warehouseLocation.deleteMany({ where: { id: { in: [locationId, secondLocationId] } } });
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

  it('offers only active purchasing references through bounded search', async () => {
    expect((await service.options({ kind: 'supplier', search: `PO-SUP-${runId}`, offset: 0, limit: 25 })).items)
      .toEqual([{ id: supplierId, code: `PO-SUP-${runId.toUpperCase()}`, label: 'Purchase Supplier' }]);
    expect((await service.options({ kind: 'warehouse', search: 'Purchase Warehouse', offset: 0, limit: 25 })).items)
      .toEqual([{ id: warehouseId, code: `PO-WH-${runId.toUpperCase()}`, label: 'Purchase Warehouse' }]);
    expect((await service.options({ kind: 'variant', search: `PO-SKU-${runId}`, offset: 0, limit: 25 })).items)
      .toEqual([{ id: variantId, code: `PO-SKU-${runId.toUpperCase()}`, label: 'Purchase Product' }]);
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });
    expect((await service.options({ kind: 'variant', search: `PO-SKU-${runId}`, offset: 0, limit: 25 })).count).toBe(0);
    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: true } });
    const order = await service.create(input(), context('location-options-create'));
    orderIds.push(order.id);
    expect(await service.receiptLocations(order.id, { search: 'RECEIVING', offset: 0, limit: 25 }))
      .toEqual({ items: [{ id: locationId, code: 'RECEIVING', label: 'Receiving' }], count: 1 });
    await prisma.warehouseLocation.update({ where: { id: secondLocationId }, data: { isActive: false } });
    expect((await service.receiptLocations(order.id, { offset: 0, limit: 25 })).items.map(item => item.id)).toEqual([locationId]);
    await prisma.warehouseLocation.update({ where: { id: secondLocationId }, data: { isActive: true } });
  });

  it('guards duplicate lines, invalid amounts and inactive references without partial writes', async () => {
    const beforeOrders = await prisma.purchaseOrder.count({ where: { supplierId } });
    await expect(service.create({ ...input(), items: [input().items[0], input().items[0]] }, context('duplicate'))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ ...input(), items: [{ variantId, orderedQty: 1, unitCost: '9223372036854775808' }] }, context('overflow'))).rejects.toBeInstanceOf(BadRequestException);
    await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: false } });
    await expect(service.create(input(), context('inactive'))).rejects.toMatchObject({ response: { code: 'SUPPLIER_INACTIVE' } });
    await prisma.supplier.update({ where: { id: supplierId }, data: { isActive: true } });
    expect(await prisma.purchaseOrder.count({ where: { supplierId } })).toBe(beforeOrders);
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

  it('receives partial and final quantities with one ledger movement per line and idempotent replay', async () => {
    const draft = await service.create(input(), context('receive-create'));
    orderIds.push(draft.id);
    const approved = await service.approve(draft.id, { expectedVersion: 0 }, context('receive-approve'));
    const firstInput = { expectedVersion: approved.version, externalReference: `DEL-1-${runId}`,
      lines: [{ variantId, locationId, quantity: 2 }] };
    const [first, replay] = await Promise.all([
      service.receive(draft.id, firstInput, context('receive-first')),
      service.receive(draft.id, firstInput, context('receive-first')),
    ]);
    expect(replay).toEqual(first);
    expect(first.lines).toHaveLength(1);
    expect((await service.get(draft.id))).toMatchObject({ status: 'PARTIALLY_RECEIVED', version: 2,
      items: [{ orderedQty: 3, receivedQty: 2 }] });
    expect((await service.receipts(draft.id, { offset: 0, limit: 50 })).items).toHaveLength(1);
    expect(await prisma.inventoryMovement.count({ where: { referenceType: 'PurchaseReceiptLine', referenceId: first.lines[0].id } })).toBe(1);
    expect(await prisma.inventoryBalance.findUnique({ where: { warehouseId_locationId_variantId: { warehouseId, locationId, variantId } } }))
      .toMatchObject({ onHand: 2, available: 2, reserved: 0 });
    await expect(service.receive(draft.id, { ...firstInput, externalReference: 'changed' }, context('receive-first')))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(service.receive(draft.id, { ...firstInput, expectedVersion: 2, externalReference: `DEL-OVER-${runId}`,
      lines: [{ variantId, locationId, quantity: 2 }] }, context('receive-over')))
      .rejects.toMatchObject({ response: { code: 'RECEIPT_QUANTITY_CONFLICT' } });
    const final = await service.receive(draft.id, { expectedVersion: 2, externalReference: `DEL-2-${runId}`,
      lines: [{ variantId, locationId, quantity: 1 }] }, context('receive-final'));
    expect((await service.get(draft.id))).toMatchObject({ status: 'RECEIVED', version: 3,
      items: [{ orderedQty: 3, receivedQty: 3 }] });
    const movements = await prisma.inventoryMovement.findMany({ where: { referenceType: 'PurchaseReceiptLine',
      referenceId: { in: [first.lines[0].id, final.lines[0].id] } }, orderBy: { createdAt: 'asc' } });
    expect(movements.map(movement => movement.type)).toEqual(['RECEIPT', 'RECEIPT']);
    expect(movements.reduce((sum, movement) => sum + movement.quantity, 0)).toBe(3);
    expect(await prisma.inventoryBalance.findUnique({ where: { warehouseId_locationId_variantId: { warehouseId, locationId, variantId } } }))
      .toMatchObject({ onHand: 3, available: 3, reserved: 0 });
    await expect(service.receive(draft.id, { expectedVersion: 3, externalReference: `DEL-3-${runId}`,
      lines: [{ variantId, locationId, quantity: 1 }] }, context('receive-after-complete')))
      .rejects.toMatchObject({ response: { code: 'PURCHASE_ORDER_STATE_CONFLICT' } });
  });

  it('allows only one concurrent receipt against the same remaining quantity', async () => {
    const draft = await service.create(input(), context('race-receipt-create'));
    orderIds.push(draft.id);
    await service.approve(draft.id, { expectedVersion: 0 }, context('race-receipt-approve'));
    const attempts = await Promise.allSettled([
      service.receive(draft.id, { expectedVersion: 1, externalReference: `RACE-A-${runId}`,
        lines: [{ variantId, locationId, quantity: 3 }] }, context('race-receipt-a')),
      service.receive(draft.id, { expectedVersion: 1, externalReference: `RACE-B-${runId}`,
        lines: [{ variantId, locationId, quantity: 3 }] }, context('race-receipt-b')),
    ]);
    expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await service.receipts(draft.id, { offset: 0, limit: 50 })).count).toBe(1);
    expect((await service.get(draft.id))).toMatchObject({ status: 'RECEIVED', items: [{ receivedQty: 3 }] });
  });

  it('rejects invalid location, unknown SKU and duplicate delivery references without stock drift', async () => {
    const draft = await service.create(input(), context('failure-create'));
    orderIds.push(draft.id);
    await service.approve(draft.id, { expectedVersion: 0 }, context('failure-approve'));
    const before = await prisma.inventoryMovement.count({ where: { warehouseId, referenceType: 'PurchaseReceiptLine' } });
    await expect(service.receive(draft.id, { expectedVersion: 1, externalReference: `BAD-LOCATION-${runId}`,
      lines: [{ variantId, locationId: 'unknown-location', quantity: 1 }] }, context('bad-location')))
      .rejects.toMatchObject({ response: { code: 'LOCATION_INACTIVE' } });
    await expect(service.receive(draft.id, { expectedVersion: 1, externalReference: `BAD-SKU-${runId}`,
      lines: [{ variantId: 'unknown-variant', locationId, quantity: 1 }] }, context('bad-sku')))
      .rejects.toMatchObject({ response: { code: 'RECEIPT_QUANTITY_CONFLICT' } });
    expect(await prisma.inventoryMovement.count({ where: { warehouseId, referenceType: 'PurchaseReceiptLine' } })).toBe(before);
    expect((await service.get(draft.id))).toMatchObject({ status: 'APPROVED', version: 1, items: [{ receivedQty: 0 }] });
    const reference = `UNIQUE-DELIVERY-${runId}`;
    await service.receive(draft.id, { expectedVersion: 1, externalReference: reference,
      lines: [{ variantId, locationId, quantity: 1 }] }, context('unique-reference'));
    await expect(service.receive(draft.id, { expectedVersion: 2, externalReference: reference,
      lines: [{ variantId, locationId, quantity: 1 }] }, context('duplicate-reference')))
      .rejects.toMatchObject({ response: { code: 'DELIVERY_REFERENCE_CONFLICT' } });
    expect((await service.get(draft.id))).toMatchObject({ status: 'PARTIALLY_RECEIVED', version: 2, items: [{ receivedQty: 1 }] });
    expect((await service.receipts(draft.id, { offset: 0, limit: 50 })).count).toBe(1);
  });

  it('reconciles a split-location receipt against PO quantity, movement rows and balances', async () => {
    const draft = await service.create(input(), context('split-create'));
    orderIds.push(draft.id);
    await service.approve(draft.id, { expectedVersion: 0 }, context('split-approve'));
    const before = await prisma.inventoryBalance.findMany({ where: { warehouseId, variantId,
      locationId: { in: [locationId, secondLocationId] } } });
    const beforeOnHand = before.reduce((sum, balance) => sum + balance.onHand, 0);
    const beforeAvailable = before.reduce((sum, balance) => sum + balance.available, 0);
    const receipt = await service.receive(draft.id, { expectedVersion: 1, externalReference: `SPLIT-${runId}`,
      lines: [{ variantId, locationId: secondLocationId, quantity: 2 }, { variantId, locationId, quantity: 1 }] }, context('split-receive'));
    expect(receipt.lines).toHaveLength(2);
    const movements = await prisma.inventoryMovement.findMany({ where: { id: { in: receipt.lines.map(line => line.movementId) } } });
    expect(movements).toHaveLength(2);
    for (const line of receipt.lines) {
      const movement = movements.find(row => row.id === line.movementId);
      expect(movement).toMatchObject({ type: 'RECEIPT', referenceType: 'PurchaseReceiptLine', referenceId: line.id,
        warehouseId, locationId: line.locationId, variantId, quantity: line.quantity });
    }
    expect(receipt.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(3);
    expect((await service.get(draft.id))).toMatchObject({ status: 'RECEIVED', items: [{ receivedQty: 3 }] });
    const balances = await prisma.inventoryBalance.findMany({ where: { warehouseId, variantId,
      locationId: { in: [locationId, secondLocationId] } } });
    expect(balances.reduce((sum, balance) => sum + balance.onHand, 0)).toBe(beforeOnHand + 3);
    expect(balances.reduce((sum, balance) => sum + balance.available, 0)).toBe(beforeAvailable + 3);
  });
});
