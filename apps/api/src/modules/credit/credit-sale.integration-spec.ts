import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { EMPTY_AXIS_SIGNATURE, canonicalizeSku } from '../catalog/variant-identifiers';
import { StaffOrderService } from '../orders/staff-order.service';
import { FulfillmentCommandService } from '../orders/fulfillment-command.service';
import { FulfillmentPickService } from '../orders/fulfillment-pick.service';
import { ShipmentDispatchService } from '../orders/shipment-dispatch.service';
import { ShipmentDeliveryService } from '../orders/shipment-delivery.service';
import { hasFulfillmentFinancialProof } from '../orders/fulfillment-financial-proof';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { CreditService } from './credit.service';
import { CreditSaleService } from './credit-sale.service';

// Real commands and PostgreSQL. No external payments/SMS or live sales database.
describe.sequential('Staff credit sale, stock, fulfillment and financial concurrency', () => {
  const prisma = new PrismaService(); const audit = new AuditLogService(prisma);
  const credit = new CreditService(prisma, audit); const inventory = new InventoryService(prisma, audit);
  const sales = new CreditSaleService(credit, inventory, audit); const staffOrders = new StaffOrderService(prisma, audit);
  const run = randomUUID().replaceAll('-', ''); const requestId = `credit-sale-it-${run}`;
  const customers: string[] = []; let actorId = ''; let variantId = ''; let warehouseId = ''; let locationId = ''; let productId = ''; let connected = false; let sequence = 0;
  const context = (key = `credit-sale-${run}-${sequence++}`) => ({ actorId, requestId: `${requestId}-${sequence++}`, idempotencyKey: key });
  const code = (value: string) => expect.objectContaining({ response: expect.objectContaining({ code: value }) });
  const statement = (customerId: string) => credit.statement(customerId, { offset: 0, limit: 25 });
  beforeAll(async () => {
    assertIsolatedTestDatabase({ databaseUrl: process.env.DATABASE_URL, nodeEnvironment: process.env.NODE_ENV });
    await prisma.$connect(); connected = true;
    actorId = (await prisma.user.create({ data: { email: `credit-sale-${run}@example.test`, status: 'ACTIVE' } })).id;
    const product = await prisma.product.create({ data: { name: 'Isolated credit test product', slug: `isolated-credit-${run}`, status: 'ACTIVE' } }); productId = product.id;
    const sku = `CREDIT-IT-${run}`;
    variantId = (await prisma.productVariant.create({ data: { productId, sku, skuKey: canonicalizeSku(sku), combinationSignature: EMPTY_AXIS_SIGNATURE, salePrice: 1000n, costPrice: 500n, status: 'ACTIVE', isActive: true } })).id;
    warehouseId = (await prisma.warehouse.create({ data: { code: `CR-${run}`, name: 'Isolated credit warehouse' } })).id;
    locationId = (await prisma.warehouseLocation.create({ data: { warehouseId, code: 'CREDIT-IT', name: 'Isolated credit shelf' } })).id;
    await prisma.inventoryBalance.create({ data: { variantId, warehouseId, locationId, onHand: 200, reserved: 0, available: 200 } });
  });
  afterAll(async () => {
    if (!connected) return;
    // Never disable financial UPDATE/DELETE guards. Cleanup only the guarded disposable database.
    await prisma.$executeRawUnsafe('TRUNCATE "CreditLedgerEntry", "CreditReceipt", "ReceivableDocument", "CreditCommandRecord", "CreditAccount"');
    const orders = (await prisma.order.findMany({ where: { customerId: { in: customers } }, select: { id: true } })).map(row => row.id);
    await prisma.shipmentLine.deleteMany({ where: { shipment: { orderId: { in: orders } } } });
    await prisma.shipment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.fulfillmentPick.deleteMany({ where: { orderItem: { orderId: { in: orders } } } });
    await prisma.fulfillmentTransition.deleteMany({ where: { fulfillment: { orderId: { in: orders } } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.orderCommandIdempotencyRecord.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: orders } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: orders } } });
    await prisma.order.deleteMany({ where: { id: { in: orders } } });
    await prisma.customer.deleteMany({ where: { id: { in: customers } } });
    await prisma.inventoryBalance.deleteMany({ where: { variantId } });
    await prisma.productVariant.delete({ where: { id: variantId } }); await prisma.product.delete({ where: { id: productId } });
    await prisma.warehouseLocation.delete({ where: { id: locationId } }); await prisma.warehouse.delete({ where: { id: warehouseId } });
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: requestId } } }); await prisma.user.delete({ where: { id: actorId } });
    await prisma.$disconnect();
  });
  async function fixture(limit = '5000', termsDays = 30) {
    const mobileSuffix = (BigInt(`0x${run}`) + BigInt(sequence++)) % 1_000_000_000n;
    const customerId = (await prisma.customer.create({ data: { mobile: `+989${mobileSuffix.toString().padStart(9, '0')}` } })).id; customers.push(customerId);
    const policy = await credit.policy(customerId, { expectedVersion: null, status: 'ACTIVE', creditLimit: limit, termsDays }, context());
    const order = await createOrder(customerId);
    return { customerId, policy, order, input: { expectedVersion: policy.account.version, expectedOrderVersion: order.version } };
  }
  async function createOrder(customerId: string) {
    const result = await staffOrders.create({ ...context(), payload: { customerId, lines: [{ variantId, quantity: 2 }], address: {
      provinceCode: 'THR', city: 'Isolated test city', address: 'Isolated test address', postalCode: '1234567890', recipient: 'Isolated test', mobile: '+989120000000',
    } } });
    return result.data.order;
  }
  const approve = (data: Awaited<ReturnType<typeof fixture>>) => sales.approve(data.customerId, data.order.id, data.input, context());
  it('atomically posts one sale, consumes actual reservations and never creates a payment/paid event', async () => {
    const data = await fixture(); const before = await prisma.inventoryBalance.findUniqueOrThrow({ where: { warehouseId_locationId_variantId: { warehouseId, locationId, variantId } } });
    const ctx = context(); const result = await sales.approve(data.customerId, data.order.id, data.input, ctx);
    expect(result.order).toMatchObject({ status: 'CREDIT_APPROVED', version: data.order.version + 1 });
    expect(result.account.outstanding.amount).toBe('2000'); expect(result.account.availableCredit.amount).toBe('3000');
    const stored = await prisma.receivableDocument.findUniqueOrThrow({ where: { orderId: data.order.id } });
    expect(stored).toMatchObject({ kind: 'SALE', amount: 2000n, termsDays: 30 });
    expect(stored.dueAt.getTime() - stored.issuedAt.getTime()).toBe(30 * 86_400_000);
    const after = await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.onHand).toBe(before.onHand - 2); expect(after.reserved).toBe(before.reserved - 2); expect(after.available).toBe(before.available);
    expect(await prisma.stockReservation.count({ where: { orderId: data.order.id, status: 'CONSUMED' } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: data.order.id, type: 'SALE' } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: data.order.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: data.order.id, topic: { in: ['ORDER_PAID', 'PAYMENT_CONFIRMED'] } } })).toBe(0);
    expect(await new CreditSaleService(credit, inventory, audit).approve(data.customerId, data.order.id, data.input, ctx)).toEqual(result);
    expect(await prisma.receivableDocument.count({ where: { orderId: data.order.id } })).toBe(1);
    const own = await statement(data.customerId); expect(own.documents[0]).toMatchObject({ kind: 'SALE', orderId: data.order.id, outstanding: { amount: '2000' } });
    expect(own.documents[0].effectivePrincipal.amount).toBe('2000');
  });
  it('rejects fresh-key repeated approval, stale account/order versions and mismatched idempotency payload', async () => {
    const data = await fixture(); const ctx = context(); await sales.approve(data.customerId, data.order.id, data.input, ctx);
    await expect(sales.approve(data.customerId, data.order.id, { ...data.input, expectedVersion: 1 }, ctx)).rejects.toEqual(code('IDEMPOTENCY_CONFLICT'));
    await expect(approve(data)).rejects.toEqual(code('ORDER_VERSION_CONFLICT'));
    const stale = await fixture(); await expect(sales.approve(stale.customerId, stale.order.id, { ...stale.input, expectedVersion: 42 }, context())).rejects.toEqual(code('CREDIT_VERSION_CONFLICT'));
    await expect(sales.approve(stale.customerId, stale.order.id, { ...stale.input, expectedOrderVersion: 42 }, context())).rejects.toEqual(code('ORDER_VERSION_CONFLICT'));
  });
  it('allows only one same-version concurrent sale within account headroom', async () => {
    const data = await fixture('3000'); const second = await createOrder(data.customerId);
    const outcomes = await Promise.allSettled([approve(data), sales.approve(data.customerId, second.id, { ...data.input, expectedOrderVersion: second.version }, context())]);
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect((await statement(data.customerId)).account!.outstanding.amount).toBe('2000');
    const current = (await statement(data.customerId)).account!;
    const pending = await prisma.order.findFirstOrThrow({ where: { customerId: data.customerId, status: 'PENDING_PAYMENT' } });
    await expect(sales.approve(data.customerId, pending.id, { expectedVersion: current.version, expectedOrderVersion: pending.version }, context())).rejects.toEqual(code('CREDIT_LIMIT_EXCEEDED'));
  });
  it('serializes concurrent identical submits and replay after restart without duplicate debt or stock', async () => {
    const data = await fixture(); const ctx = context(); const results = await Promise.all([sales.approve(data.customerId, data.order.id, data.input, ctx), sales.approve(data.customerId, data.order.id, data.input, ctx)]);
    expect(results[0]).toEqual(results[1]); expect(await prisma.receivableDocument.count({ where: { orderId: data.order.id } })).toBe(1);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: data.order.id, type: 'SALE' } })).toBe(1);
  });
  it('denies suspended credit, inactive customer and overdue debt with no stock consumption', async () => {
    const data = await fixture(); const policy = await credit.policy(data.customerId, { expectedVersion: 0, creditLimit: '5000', status: 'SUSPENDED', termsDays: 30 }, context());
    await expect(sales.approve(data.customerId, data.order.id, { ...data.input, expectedVersion: policy.account.version }, context())).rejects.toEqual(code('CREDIT_ACCOUNT_INACTIVE'));
    const inactive = await fixture(); await prisma.customer.update({ where: { id: inactive.customerId }, data: { status: 'INACTIVE', deactivatedAt: new Date() } });
    await expect(approve(inactive)).rejects.toEqual(code('CREDIT_ACCOUNT_INACTIVE'));
    const overdue = await fixture(); const opening = await credit.opening(overdue.customerId, { expectedVersion: 0, amount: '100', issuedAt: new Date(Date.now() - 86_400_000).toISOString(), dueAt: new Date(Date.now() - 1000).toISOString(), sourceReference: `isolated-overdue-${run}` }, context());
    await expect(sales.approve(overdue.customerId, overdue.order.id, { ...overdue.input, expectedVersion: opening.account.version }, context())).rejects.toEqual(code('CREDIT_OVERDUE'));
    expect(await prisma.receivableDocument.count({ where: { orderId: { in: [data.order.id, inactive.order.id, overdue.order.id] } } })).toBe(0);
  });
  it('rejects expired or incomplete reservation evidence atomically', async () => {
    const expired = await fixture(); await prisma.order.update({ where: { id: expired.order.id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    await expect(approve(expired)).rejects.toEqual(code('RESERVATION_EXPIRED'));
    const incomplete = await fixture(); await prisma.stockReservation.updateMany({ where: { orderId: incomplete.order.id }, data: { status: 'RELEASED' } });
    await expect(approve(incomplete)).rejects.toEqual(code('RESERVATION_EXPIRED'));
    expect(await prisma.receivableDocument.count({ where: { orderId: { in: [expired.order.id, incomplete.order.id] } } })).toBe(0);
  });
  it('rejects customer mismatch, non-staff source and any existing ambiguous/failed payment attempt', async () => {
    const a = await fixture(); const b = await fixture();
    await expect(sales.approve(b.customerId, a.order.id, b.input, context())).rejects.toEqual(code('ORDER_NOT_FOUND'));
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: a.order.id } }); await expect(approve(a)).rejects.toEqual(code('CREDIT_SALE_CONFLICT'));
    for (const status of ['PENDING', 'FAILED'] as const) {
      const data = await fixture(); await prisma.payment.create({ data: { orderId: data.order.id, provider: 'ISOLATED_TEST', idempotencyFingerprint: 'a'.repeat(64), idempotencyKey: `isolated-pay-${run}-${sequence++}`, status, amount: 2000n } });
      await expect(approve(data)).rejects.toEqual(code('CREDIT_PAYMENT_CONFLICT'));
    }
  });
  it('reconciles a competing order-locked payment registration instead of creating a credit/paid overlap', async () => {
    const data = await fixture(); let unlock!: () => void; let locked!: () => void;
    const held = new Promise<void>(resolve => { unlock = resolve; }); const ready = new Promise<void>(resolve => { locked = resolve; });
    const registering = prisma.$transaction(async tx => {
      const [hi, lo] = advisoryLockIdKey('order', data.order.id); await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      locked(); await held; await tx.payment.create({ data: { orderId: data.order.id, provider: 'ISOLATED_TEST', idempotencyFingerprint: 'a'.repeat(64), idempotencyKey: `isolated-pay-${run}-${sequence++}`, amount: 2000n, status: 'PENDING' } });
    }, { isolationLevel: 'Serializable' });
    await ready; const rejected = expect(approve(data)).rejects.toEqual(code('CREDIT_PAYMENT_CONFLICT')); unlock(); await registering;
    await rejected;
    expect(await prisma.receivableDocument.count({ where: { orderId: data.order.id } })).toBe(0);
  });
  it('blocks a competing SQL payment insert on the order row and rejects it after credit approval commits', async () => {
    const data = await fixture(); const localInventory = new InventoryService(prisma, audit);
    const consume = localInventory.consumeReservationsForOrder.bind(localInventory);
    let release!: () => void; let notify!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }); const consumed = new Promise<void>(resolve => { notify = resolve; });
    const spy = vi.spyOn(localInventory, 'consumeReservationsForOrder').mockImplementation(async (...args) => {
      const count = await consume(...args); notify(); await held; return count;
    });
    try {
      const approving = new CreditSaleService(credit, localInventory, audit).approve(data.customerId, data.order.id, data.input, context());
      await consumed;
      const inserted = expect(prisma.payment.create({ data: { orderId: data.order.id, provider: 'ISOLATED_TEST', idempotencyFingerprint: 'a'.repeat(64), idempotencyKey: `isolated-pay-${run}-${sequence++}`, amount: 2000n, status: 'PENDING' } })).rejects.toBeDefined();
      release(); await approving; await inserted;
      expect(await prisma.payment.count({ where: { orderId: data.order.id } })).toBe(0);
      expect((await statement(data.customerId)).account!.outstanding.amount).toBe('2000');
    } finally { release(); spy.mockRestore(); }
  });
  it('supports real fulfillment/pick/dispatch/delivery while keeping the debt and payment states separate', async () => {
    const data = await fixture(); const approval = await approve(data);
    const commands = new FulfillmentCommandService(prisma, audit); const picks = new FulfillmentPickService(prisma, audit);
    await commands.execute(data.order.id, 'start', context());
    await expect(commands.execute(data.order.id, 'ready', context())).rejects.toEqual(code('FULFILLMENT_STATE_CONFLICT'));
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: data.order.id } });
    await picks.record(data.order.id, item.id, item.quantity, context()); await commands.execute(data.order.id, 'ready', context());
    const ctx = context(); const dispatch = new ShipmentDispatchService(prisma, audit);
    const sent = await dispatch.dispatch(data.order.id, { carrier: 'Isolated test carrier', trackingCode: `CREDIT-${run}` }, ctx);
    expect(await dispatch.dispatch(data.order.id, { carrier: 'Isolated test carrier', trackingCode: `CREDIT-${run}` }, ctx)).toEqual(sent);
    await new ShipmentDeliveryService(prisma, audit).confirm(data.order.id, { proofReference: `ISOLATED-${run}` }, context());
    expect((await prisma.order.findUniqueOrThrow({ where: { id: data.order.id }, include: { fulfillment: true } }))).toMatchObject({ status: 'CREDIT_APPROVED', fulfillment: { status: 'DELIVERED' } });
    expect((await statement(data.customerId)).account!.outstanding.amount).toBe('2000');
    await credit.receipt(data.customerId, { expectedVersion: approval.account.version, amount: '2000', method: 'CASH', effectiveAt: new Date().toISOString(), evidenceReference: `isolated-sale-receipt-${run}`, allocations: [{ documentId: approval.documentId!, amount: '2000' }] }, context());
    expect((await statement(data.customerId)).documents[0].status).toBe('PAID');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: data.order.id } })).status).toBe('CREDIT_APPROVED');
    expect(await prisma.payment.count({ where: { orderId: data.order.id } })).toBe(0);
  });
  it('rejects status-only approval, financial snapshot rewriting and payment insertion at database commit', async () => {
    const pending = await fixture(); await expect(prisma.order.update({ where: { id: pending.order.id }, data: { status: 'CREDIT_APPROVED' } })).rejects.toBeDefined();
    const approved = await fixture(); await approve(approved);
    await expect(prisma.order.update({ where: { id: approved.order.id }, data: { status: 'PAID' } })).rejects.toBeDefined();
    await expect(prisma.order.update({ where: { id: approved.order.id }, data: { grandTotal: 1n } })).rejects.toBeDefined();
    await expect(prisma.payment.create({ data: { orderId: approved.order.id, provider: 'ISOLATED_TEST', idempotencyFingerprint: 'a'.repeat(64), idempotencyKey: `isolated-pay-${run}-${sequence++}`, amount: 2000n, status: 'PENDING' } })).rejects.toBeDefined();
    expect(await prisma.payment.count({ where: { orderId: approved.order.id } })).toBe(0);
  });
  it('requires immutable debt proof for credit fulfillment and preserves the existing paid-proof path', async () => {
    await prisma.$transaction(async tx => {
      expect(await hasFulfillmentFinancialProof(tx, 'missing-order', 'CREDIT_APPROVED', [])).toBe(false);
      expect(await hasFulfillmentFinancialProof(tx, 'missing-order', 'PAID', [])).toBe(false);
      expect(await hasFulfillmentFinancialProof(tx, 'missing-order', 'PAID', [{ id: 'existing-settlement' }])).toBe(true);
      expect(await hasFulfillmentFinancialProof(tx, 'missing-order', 'PENDING_PAYMENT', [{ id: 'existing-settlement' }])).toBe(false);
    });
  });
});
