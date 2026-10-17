import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
  combinationSignature,
} from '../catalog/variant-identifiers';
import { OrderCommandService } from './order-command.service';
import { FulfillmentCommandService } from './fulfillment-command.service';
import { FulfillmentPickService } from './fulfillment-pick.service';
import { ShipmentDispatchService } from './shipment-dispatch.service';
import { ShipmentDeliveryService } from './shipment-delivery.service';
import { OrderReadService } from './order-read.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function numericSuffix(value: string, increment: number): string {
  const packed = (BigInt(`0x${value}`) % 10_000_000_000n + BigInt(increment))
    .toString()
    .padStart(10, '0');
  return packed;
}

describe.sequential('OrderCommandService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const customerUser = `ordcmd_customer_${runId}`;
  const otherUser = `ordcmd_other_${runId}`;
  const staffUser = `ordcmd_staff_${runId}`;
  const staffUserTwo = `ordcmd_staff_two_${runId}`;
  const customerId = `ordcmd_customer_id_${runId}`;
  const otherCustomerId = `ordcmd_other_customer_id_${runId}`;
  const productId = `ordcmd_product_${runId}`;
  const variantAId = `ordcmd_variant_a_${runId}`;
  const variantBId = `ordcmd_variant_b_${runId}`;
  const warehouseId = `ordcmd_warehouse_${runId}`;
  const locationAId = `ordcmd_location_a_${runId}`;
  const locationBId = `ordcmd_location_b_${runId}`;
  const requestIdPrefix = `ordcmd-${runId}`;
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, audit);
  const commands = new OrderCommandService(prisma, audit, inventory);
  const fulfillmentCommands = new FulfillmentCommandService(prisma, audit);
  const fulfillmentPicks = new FulfillmentPickService(prisma, audit);
  const shipments = new ShipmentDispatchService(prisma, audit);
  const delivery = new ShipmentDeliveryService(prisma, audit);
  const orderReads = new OrderReadService(prisma);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    await prisma.user.createMany({
      data: [
        { id: customerUser, email: `ordcmd-a-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: otherUser, email: `ordcmd-b-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: staffUser, email: `ordcmd-c-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: staffUserTwo, email: `ordcmd-d-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
      ],
    });
    await prisma.customer.createMany({
      data: [
        { id: customerId, userId: customerUser, mobile: `+9890${numericSuffix(runId, 0)}` },
        { id: otherCustomerId, userId: otherUser, mobile: `+9890${numericSuffix(runId, 1)}` },
      ],
    });
    await prisma.product.create({
      data: { id: productId, name: 'Order command product', slug: `ordcmd-product-${runId}`, status: 'ACTIVE' },
    });
    await prisma.productVariant.createMany({
      data: [
        { id: variantAId, productId, sku: `ORDCMD-A-${runId}`, skuKey: canonicalizeSku(`ORDCMD-A-${runId}`), combinationSignature: EMPTY_AXIS_SIGNATURE, title: 'Variant A', costPrice: 80000n, salePrice: 100000n, status: 'ACTIVE', isActive: true },
        { id: variantBId, productId, sku: `ORDCMD-B-${runId}`, skuKey: canonicalizeSku(`ORDCMD-B-${runId}`), combinationSignature: combinationSignature([{ attributeId: 'ordcmd-axis', optionId: 'ordcmd-option-b' }]), title: 'Variant B', costPrice: 160000n, salePrice: 200000n, status: 'ACTIVE', isActive: true },
      ],
    });
    await prisma.warehouse.create({
      data: { id: warehouseId, code: `ORDCMD-WH-${runId}`, name: 'Order command warehouse' },
    });
    await prisma.warehouseLocation.createMany({
      data: [
        { id: locationAId, warehouseId, code: 'A-01', name: 'A' },
        { id: locationBId, warehouseId, code: 'B-01', name: 'B' },
      ],
    });
  });

  beforeEach(async () => {
    await resetState();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetState();
    await prisma.inventoryBalance.deleteMany({ where: { variantId: { in: [variantAId, variantBId] } } });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customerUser, otherUser, staffUser, staffUserTwo] } } });
    await prisma.$disconnect();
  });

  it('cancels an owned pending order and compensates every reservation exactly once', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 2 },
      { variantId: variantAId, locationId: locationBId, quantity: 1 },
      { variantId: variantBId, locationId: locationBId, quantity: 1 },
    ]);
    const key = `cancel-${runId}`;
    const requestId = `${requestIdPrefix}-cancel`;

    const result = await commands.cancelAsCustomer(customerUser, order.id, {
      idempotencyKey: key,
      requestId,
    });

    expect(result.data.order).toMatchObject({
      id: order.id,
      number: order.number,
      status: 'CANCELLED',
      releasedReservations: 3,
      cancelledAt: expect.any(String),
    });
    expect(new Date(result.data.order.cancelledAt).getTime()).toBeGreaterThan(0);

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { transitions: true },
    });
    expect(persisted.status).toBe('CANCELLED');
    expect(persisted.transitions).toContainEqual(
      expect.objectContaining({
        from: 'PENDING_PAYMENT',
        to: 'CANCELLED',
        reason: 'CUSTOMER_CANCELLED',
        actorId: customerUser,
        requestId,
      }),
    );

    await expect(
      prisma.auditLog.count({ where: { action: 'order.cancelled', entityId: order.id } }),
    ).resolves.toBe(1);
    const releasedReservationIds = await reservedIds(order.id);
    await expect(
      prisma.auditLog.count({ where: { action: 'inventory.reservation.released', entityId: { in: releasedReservationIds } } }),
    ).resolves.toBe(3);

    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(3);
    for (const reservation of await prisma.stockReservation.findMany({ where: { orderId: order.id } })) {
      const balance = await prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          warehouseId_locationId_variantId: {
            warehouseId,
            locationId: reservation.locationId,
            variantId: reservation.variantId,
          },
        },
      });
      expect(balance.reserved).toBe(0);
      expect(balance.available).toBe(balance.onHand);
    }

    await expect(
      prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: order.id, topic: 'ORDER_CANCELLED' },
      }),
    ).resolves.toMatchObject({ deduplicationKey: `order-cancelled:${order.id}` });

    await expect(
      prisma.orderCommandIdempotencyRecord.findUniqueOrThrow({
        where: { orderId_scope_keyHash: { orderId: order.id, scope: 'order.cancel:customer', keyHash: sha256(key) } },
      }),
    ).resolves.toMatchObject({ scope: 'order.cancel:customer', responseJson: expect.any(Object) });
    await expect(
      prisma.orderCommandIdempotencyRecord.count({ where: { orderId: order.id, scope: 'order.cancel:customer', expiresAt: { gt: new Date() } } }),
    ).resolves.toBe(1);
  });

  it('replays the cached cancel response without touching transitions, inventory or outbox', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    const key = `replay-${runId}`;

    const first = await commands.cancelAsCustomer(customerUser, order.id, {
      idempotencyKey: key,
      requestId: `${requestIdPrefix}-replay-a`,
    });
    const replay = await commands.cancelAsCustomer(customerUser, order.id, {
      idempotencyKey: key,
      requestId: `${requestIdPrefix}-replay-b`,
    });

    expect(replay).toEqual(first);
    await expect(prisma.orderTransition.count({ where: { orderId: order.id } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_CANCELLED' } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { action: 'order.cancelled', entityId: order.id } })).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(1);
  });

  it('rejects reusing a staff cancel key with a different actor payload', async () => {
    const order = await createPendingOrderWithLines(otherCustomerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    const key = `staff-key-${runId}`;

    const first = await commands.cancelAsStaff(staffUser, order.id, {
      idempotencyKey: key,
      requestId: `${requestIdPrefix}-staff-a`,
    });
    expect(first.data.order.status).toBe('CANCELLED');

    await expect(
      commands.cancelAsStaff(staffUserTwo, order.id, {
        idempotencyKey: key,
        requestId: `${requestIdPrefix}-staff-b`,
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('hides a foreign order behind an ownership 404 with no side effects', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);

    await expect(
      commands.cancelAsCustomer(otherUser, order.id, {
        idempotencyKey: `foreign-${runId}`,
        requestId: `${requestIdPrefix}-foreign`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(0);
    await expect(prisma.orderCommandIdempotencyRecord.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });

  it('lets staff cancel a pending order without a customer profile link', async () => {
    const order = await createPendingOrderWithLines(otherCustomerId, [
      { variantId: variantBId, locationId: locationBId, quantity: 1 },
    ]);
    const requestId = `${requestIdPrefix}-staff-cancel`;

    const result = await commands.cancelAsStaff(staffUser, order.id, {
      idempotencyKey: `staff-cancel-${runId}`,
      requestId,
    });

    expect(result.data.order.status).toBe('CANCELLED');
    await expect(
      prisma.orderTransition.findFirstOrThrow({
        where: { orderId: order.id, to: 'CANCELLED' },
      }),
    ).resolves.toMatchObject({ from: 'PENDING_PAYMENT', reason: 'STAFF_CANCELLED', actorId: staffUser });
    await expect(
      prisma.orderCommandIdempotencyRecord.count({
        where: { orderId: order.id, scope: 'order.cancel:staff', fingerprint: sha256(JSON.stringify({ actorId: staffUser, reason: 'STAFF_CANCELLED' })) },
      }),
    ).resolves.toBe(1);
  });

  it('rejects cancelling an order that already moved on', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await runExpiry(order.id);

    await expect(
      commands.cancelAsCustomer(customerUser, order.id, {
        idempotencyKey: `late-cancel-${runId}`,
        requestId: `${requestIdPrefix}-late-cancel`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_STATE_CONFLICT' } });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_CANCELLED' } })).resolves.toBe(0);
  });

  it('attributes system expiry and both reservation releases without creating or impersonating a User', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 2 },
      { variantId: variantBId, locationId: locationBId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const usersBefore = await prisma.user.count();
    const requestId = `${requestIdPrefix}-system`;
    expect(await commands.expireAbandonedOrdersAsSystem(requestId)).toEqual({ data: { expired: 1 } });
    const correlated = `${requestId}:${order.id}`;
    const transition = await prisma.orderTransition.findFirstOrThrow({ where: { orderId: order.id, to: 'CANCELLED' } });
    expect(transition).toMatchObject({ actorId: null, requestId: correlated, reason: 'RESERVATION_EXPIRED' });
    const events = await prisma.auditLog.findMany({ where: { requestId: correlated } });
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.actorId).toBeNull();
      expect(event.metadata).toMatchObject({ systemActor: 'order-reservation-expiry' });
    }
    expect(events.find(event => event.action === 'order.expired')?.metadata).toMatchObject({ transitionId: transition.id });
    for (const event of events.filter(event => event.action === 'inventory.reservation.released')) {
      expect(event.metadata).toMatchObject({ orderId: order.id });
    }
    const balances = await prisma.inventoryBalance.findMany({ where: { warehouseId, variantId: { in: [variantAId, variantBId] } } });
    expect(balances).toHaveLength(2);
    for (const balance of balances) {
      expect(balance.onHand).toBe(balance.variantId === variantAId ? 2 : 1);
      expect(balance.reserved).toBe(0);
      expect(balance.available).toBe(balance.onHand);
    }
    expect(await prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).toBe(2);
    expect(await prisma.inventoryMovement.count({ where: { referenceType: 'order', referenceId: order.id } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_EXPIRED' } })).toBe(1);
    const restarted = new OrderCommandService(prisma, audit, inventory);
    expect(await restarted.expireAbandonedOrdersAsSystem(`${requestId}-restarted`)).toEqual({ data: { expired: 0 } });
    expect(await prisma.auditLog.count({ where: { requestId: correlated } })).toBe(3);
    expect(await prisma.orderTransition.count({ where: { orderId: order.id, to: 'CANCELLED' } })).toBe(1);
    expect(await prisma.user.count()).toBe(usersBefore);
  });

  it('coalesces two system expiry callers into one audited transition and release', async () => {
    const order = await createPendingOrderWithLines(customerId, [{ variantId: variantAId, locationId: locationAId, quantity: 1 }]);
    await makeOverdue(order.id);
    const results = await Promise.all([
      commands.expireAbandonedOrdersAsSystem(`${requestIdPrefix}-system-race-a`),
      commands.expireAbandonedOrdersAsSystem(`${requestIdPrefix}-system-race-b`),
    ]);
    expect(results.reduce((sum, result) => sum + result.data.expired, 0)).toBe(1);
    expect(await prisma.orderTransition.count({ where: { orderId: order.id, to: 'CANCELLED', actorId: null } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: 'order.expired', actorId: null } })).toBe(1);
    expect(await prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_EXPIRED' } })).toBe(1);
    const balance = await prisma.inventoryBalance.findFirstOrThrow({ where: { warehouseId, variantId: variantAId } });
    expect(balance).toMatchObject({ onHand: 1, reserved: 0, available: 1 });
  });

  it('preserves attempted payments and their stock on the system entry point', async () => {
    const order = await createPendingOrderWithLines(customerId, [{ variantId: variantAId, locationId: locationAId, quantity: 1 }]);
    await makeOverdue(order.id);
    await prisma.payment.create({ data: {
      orderId: order.id, amount: 150n, status: 'PENDING', provider: 'zarinpal', gatewayEnvironment: 'sandbox',
      idempotencyKey: `${runId}-system-held`, idempotencyFingerprint: sha256(`${runId}-system-held`),
    } });
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { warehouseId, variantId: variantAId } });
    expect(await commands.expireAbandonedOrdersAsSystem(`${requestIdPrefix}-system-held`)).toEqual({ data: { expired: 0 } });
    await assertPreserved(order.id, balanceBefore);
    expect(await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).toMatchObject({ status: 'PENDING', authority: null });
  });

  it.each(['order.expired', 'inventory.reservation.released'])('rolls back system expiry when %s audit fails', async action => {
    const order = await createPendingOrderWithLines(customerId, [{ variantId: variantAId, locationId: locationAId, quantity: 1 }]);
    await makeOverdue(order.id);
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { warehouseId, variantId: variantAId } });
    const record = audit.record.bind(audit);
    const failure = vi.spyOn(audit, 'record').mockImplementation(async (event, tx) => {
      if (event.action === action) throw new Error('Isolated system expiry audit failure');
      return record(event, tx);
    });
    try {
      await expect(commands.expireAbandonedOrdersAsSystem(`${requestIdPrefix}-system-rollback`)).rejects.toThrow('Isolated system expiry audit failure');
      await assertPreserved(order.id, balanceBefore);
      expect(await prisma.auditLog.count({ where: { requestId: { startsWith: `${requestIdPrefix}-system-rollback` } } })).toBe(0);
    } finally { failure.mockRestore(); }
  });

  it('expires overdue pending orders once and idempotently returns zero on a later run', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const runRequestId = `${requestIdPrefix}-expiry-run`;

    const first = await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: runRequestId },
      { now: new Date() },
    );

    expect(first).toEqual({ data: { expired: 1 } });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(
      prisma.orderTransition.findFirstOrThrow({ where: { orderId: order.id, to: 'CANCELLED' } }),
    ).resolves.toMatchObject({ reason: 'RESERVATION_EXPIRED', from: 'PENDING_PAYMENT', requestId: `${runRequestId}:${order.id}` });
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(1);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId, locationId: locationAId, variantId: variantAId } },
    });
    expect(balance.reserved).toBe(0);
    await expect(
      prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: order.id, topic: 'ORDER_EXPIRED' } }),
    ).resolves.toMatchObject({ deduplicationKey: `order-expired:${order.id}` });
    await expect(prisma.auditLog.count({ where: { action: 'order.expired', entityId: order.id } })).resolves.toBe(1);

    const second = await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: `${runRequestId}-again` },
      { now: new Date() },
    );
    expect(second).toEqual({ data: { expired: 0 } });
  });

  it('coalesces a concurrent cancel vs expiry into exactly one cancellation', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);

    const settle = await Promise.allSettled([
      commands.cancelAsCustomer(customerUser, order.id, {
        idempotencyKey: `race-cancel-${runId}`,
        requestId: `${requestIdPrefix}-race-cancel`,
      }),
      commands.expirePendingPaymentOrders(
        { actorId: staffUser, requestId: `${requestIdPrefix}-race-expire` },
        { now: new Date() },
      ),
    ]);

    settle.forEach((entry) => {
      expect(entry.status === 'fulfilled' || entry.status === 'rejected').toBe(true);
    });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'CANCELLED' });
    await expect(prisma.orderTransition.count({ where: { orderId: order.id, to: 'CANCELLED' } })).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(1);
    const balance = await prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId, locationId: locationAId, variantId: variantAId } },
    });
    expect(balance.reserved).toBe(0);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: { in: ['ORDER_CANCELLED', 'ORDER_EXPIRED'] } } })).resolves.toBe(1);
  });

  it.each([
    { status: 'PENDING', authority: null },
    { status: 'PENDING', authority: 'ISOLATED-EXPIRY-TEST' },
    { status: 'PAID', authority: null },
    { status: 'FAILED', authority: null },
    { status: 'CANCELLED', authority: null },
    { status: 'REFUNDED', authority: null },
    { status: 'PARTIALLY_REFUNDED', authority: null },
  ] as const)('preserves an attempted order with payment $status / authority $authority', async ({ status, authority }) => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    // Synthetic isolated database states test fail-closed behavior; no provider acceptance is claimed.
    const payment = await prisma.payment.create({ data: {
      orderId: order.id, provider: 'zarinpal', amount: 150n, status, authority,
      idempotencyKey: `expiry-protected-${runId}-${status}`, idempotencyFingerprint: sha256('expiry-protected'),
    } });
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variantAId, locationId: locationAId } });
    const result = await commands.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-payment-held` });
    expect(result).toEqual({ data: { expired: 0 } });
    await assertPreserved(order.id, balanceBefore);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment);
  });

  it.each(['gateway_unconfirmed', 'gateway_unavailable'])('does not treat legacy FAILED/%s as authority to release stock', async (reason) => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const payment = await prisma.payment.create({ data: {
      orderId: order.id, provider: 'zarinpal', amount: 150n, status: 'FAILED',
      idempotencyKey: `expiry-legacy-${runId}`, idempotencyFingerprint: sha256('expiry-legacy'),
      transitions: { create: { from: 'PENDING', to: 'FAILED', reason, actorId: staffUser, requestId: `${requestIdPrefix}-legacy-payment` } },
    } });
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variantAId, locationId: locationAId } });
    expect(await commands.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-legacy-held` }))
      .toEqual({ data: { expired: 0 } });
    await assertPreserved(order.id, balanceBefore);
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment);
    expect(await prisma.paymentTransition.count({ where: { paymentId: payment.id, reason } })).toBe(1);
  });

  it('rechecks a deadline changed after real candidate selection', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const extendedDeadline = new Date(Date.now() + 60_000);
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variantAId, locationId: locationAId } });
    const interleaved = afterCandidateSelection(async () => {
      await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: extendedDeadline } });
    });
    expect(await interleaved.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-deadline-race` }))
      .toEqual({ data: { expired: 0 } });
    await assertPreserved(order.id, balanceBefore);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).reservationExpiresAt).toEqual(extendedDeadline);
  });

  it('rechecks an attempt registered under the order lock after candidate selection', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variantAId, locationId: locationAId } });
    const interleaved = afterCandidateSelection(async () => {
      await prisma.$transaction(async (tx) => {
        const [high, low] = advisoryLockIdKey('order', order.id);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${high}::int, ${low}::int)`;
        await tx.payment.create({ data: {
          orderId: order.id, provider: 'zarinpal', amount: 150n,
          idempotencyKey: `expiry-registration-${runId}`, idempotencyFingerprint: sha256('expiry-registration'),
        } });
      });
    });
    expect(await interleaved.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-registration-race` }))
      .toEqual({ data: { expired: 0 } });
    await assertPreserved(order.id, balanceBefore);
    expect(await prisma.payment.count({ where: { orderId: order.id, status: 'PENDING', authority: null } })).toBe(1);
  });

  it('does not let an older attempted order starve a bounded page of eligible abandoned orders', async () => {
    const blocked = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    const eligible = await createPendingOrderWithLines(otherCustomerId, [
      { variantId: variantBId, locationId: locationBId, quantity: 1 },
    ]);
    await prisma.order.update({ where: { id: blocked.id }, data: { reservationExpiresAt: new Date(Date.now() - 120_000) } });
    await makeOverdue(eligible.id);
    await prisma.payment.create({ data: {
      orderId: blocked.id, provider: 'zarinpal', amount: 150n,
      idempotencyKey: `expiry-starvation-${runId}`, idempotencyFingerprint: sha256('expiry-starvation'),
    } });
    expect(await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: `${requestIdPrefix}-bounded-page` }, { batchSize: 1 },
    )).toEqual({ data: { expired: 1 } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: blocked.id } })).status).toBe('PENDING_PAYMENT');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: eligible.id } })).status).toBe('CANCELLED');
    expect(await prisma.stockReservation.count({ where: { orderId: blocked.id, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.stockReservation.count({ where: { orderId: eligible.id, status: 'RELEASED' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: blocked.id } })).toBe(0);
  });

  it('commits one expiry at the exact boundary across two simultaneous sweepers', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    const deadline = new Date();
    await prisma.order.update({ where: { id: order.id }, data: { reservationExpiresAt: deadline } });
    const context = { actorId: staffUser, requestId: `${requestIdPrefix}-two-sweepers` };
    const results = await Promise.all([
      commands.expirePendingPaymentOrders(context, { now: deadline }),
      commands.expirePendingPaymentOrders({ ...context, requestId: `${requestIdPrefix}-two-sweepers-replay` }, { now: deadline }),
    ]);
    expect(results.reduce((sum, result) => sum + result.data.expired, 0)).toBe(1);
    expect(await prisma.orderTransition.count({ where: { orderId: order.id, to: 'CANCELLED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId: order.id, action: 'order.expired' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_EXPIRED' } })).toBe(1);
    expect(await prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).toBe(1);
  });

  it('counts a committed order expiry when its reservations were already released', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    await prisma.$transaction((tx) => inventory.releaseReservationsForOrder(tx, order.id, {
      actorId: staffUser, requestId: `${requestIdPrefix}-earlier-reservation-release`,
    }));
    expect(await commands.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-count-order` }))
      .toEqual({ data: { expired: 1 } });
    expect(await prisma.auditLog.findFirstOrThrow({ where: { entityId: order.id, action: 'order.expired' } }))
      .toMatchObject({ after: { status: 'CANCELLED', releasedReservations: 0 } });
    expect(await commands.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-count-order-replay` }))
      .toEqual({ data: { expired: 0 } });
  });

  it('rolls back order, reservation, balance and outbox writes if the expiry audit fails', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await makeOverdue(order.id);
    const balanceBefore = await prisma.inventoryBalance.findFirstOrThrow({ where: { variantId: variantAId, locationId: locationAId } });
    const record = audit.record.bind(audit);
    const failure = vi.spyOn(audit, 'record').mockImplementation(async (event, tx) => {
      if (event.action === 'order.expired') throw new Error('Isolated expiry audit failure');
      return record(event, tx);
    });
    try {
      await expect(commands.expirePendingPaymentOrders({ actorId: staffUser, requestId: `${requestIdPrefix}-audit-failure` }))
        .rejects.toThrow('Isolated expiry audit failure');
      await assertPreserved(order.id, balanceBefore);
    } finally {
      failure.mockRestore();
    }
  });

  it('moves a paid and consumed order through operator processing exactly once under concurrent retries', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
      await inventory.consumeReservationsForOrder(tx, order.id, { requestId: `${requestIdPrefix}-settle` });
      await tx.payment.create({ data: {
        orderId: order.id, provider: 'zarinpal', amount: 150n, status: 'PAID',
        idempotencyKey: `fulfillment-payment-${runId}`, idempotencyFingerprint: sha256('fulfillment-payment'),
      } });
      await tx.fulfillment.create({ data: { orderId: order.id } });
    });
    const context = { actorId: staffUser, requestId: `${requestIdPrefix}-start`, idempotencyKey: `start-${runId}` };
    const [first, replay] = await Promise.all([
      fulfillmentCommands.execute(order.id, 'start', context),
      fulfillmentCommands.execute(order.id, 'start', { ...context, requestId: `${requestIdPrefix}-start-retry` }),
    ]);
    expect(replay).toEqual(first);
    expect(first.data.fulfillment.status).toBe('PROCESSING');
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillmentId: first.data.fulfillment.id } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityId: first.data.fulfillment.id, action: 'fulfillment.start' } })).resolves.toBe(1);
    await expect(fulfillmentCommands.execute(order.id, 'start', { ...context, actorId: staffUserTwo })).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(fulfillmentCommands.execute(order.id, 'start', { ...context, idempotencyKey: `again-${runId}` })).rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });

    await expect(fulfillmentCommands.execute(order.id, 'ready', { actorId: staffUser, requestId: `${requestIdPrefix}-ready-too-early`, idempotencyKey: `ready-early-${runId}` }))
      .rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(prisma.fulfillmentPick.create({ data: {
      fulfillmentId: first.data.fulfillment.id, orderItemId: item.id,
      quantity: item.quantity + 1, actorId: staffUser, requestId: `${requestIdPrefix}-invalid-db-pick`,
    } })).rejects.toThrow();

    const pickContext = { actorId: staffUser, requestId: `${requestIdPrefix}-pick`, idempotencyKey: `pick-${runId}` };
    await expect(fulfillmentPicks.record(order.id, item.id, item.quantity + 1, pickContext))
      .rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });
    const [picked, pickReplay] = await Promise.all([
      fulfillmentPicks.record(order.id, item.id, item.quantity, pickContext),
      fulfillmentPicks.record(order.id, item.id, item.quantity, { ...pickContext, requestId: `${requestIdPrefix}-pick-replay` }),
    ]);
    expect(pickReplay).toEqual(picked);
    expect(picked.data.pick).toMatchObject({ orderItemId: item.id, quantity: item.quantity, actorId: staffUser });
    await expect(prisma.fulfillmentPick.count({ where: { fulfillmentId: first.data.fulfillment.id } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityId: first.data.fulfillment.id, action: 'fulfillment.item.picked' } })).resolves.toBe(1);
    await expect(fulfillmentPicks.record(order.id, item.id, item.quantity, { ...pickContext, actorId: staffUserTwo }))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(fulfillmentPicks.record(order.id, item.id, item.quantity, { ...pickContext, idempotencyKey: `pick-again-${runId}` }))
      .rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });
    const list = await fulfillmentPicks.list(order.id);
    expect(list.data.items).toMatchObject([{ orderItemId: item.id, pick: { id: picked.data.pick.id } }]);

    const ready = await fulfillmentCommands.execute(order.id, 'ready', { actorId: staffUser, requestId: `${requestIdPrefix}-ready`, idempotencyKey: `ready-${runId}` });
    expect(ready.data.fulfillment.status).toBe('READY_TO_SHIP');
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillmentId: ready.data.fulfillment.id } })).resolves.toBe(2);
  });

  it('refuses fulfillment before reservation consumption', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID' } });
    await prisma.payment.create({ data: {
      orderId: order.id, provider: 'zarinpal', amount: 150n, status: 'PAID',
      idempotencyKey: `unconsumed-payment-${runId}`, idempotencyFingerprint: sha256('unconsumed-payment'),
    } });
    await prisma.fulfillment.create({ data: { orderId: order.id } });
    await expect(fulfillmentCommands.execute(order.id, 'start', {
      actorId: staffUser, requestId: `${requestIdPrefix}-unconsumed`, idempotencyKey: `unconsumed-${runId}`,
    })).rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillment: { orderId: order.id } } })).resolves.toBe(0);
  });

  it('requires independent proof for every order line before ready-to-ship', async () => {
    const order = await createPendingOrderWithLines(customerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
      { variantId: variantBId, locationId: locationBId, quantity: 1 },
    ]);
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'PAID', subtotal: 200n, grandTotal: 250n } });
      await inventory.consumeReservationsForOrder(tx, order.id, { requestId: `${requestIdPrefix}-two-settle` });
      await tx.payment.create({ data: {
        orderId: order.id, provider: 'zarinpal', amount: 250n, status: 'PAID',
        idempotencyKey: `two-line-payment-${runId}`, idempotencyFingerprint: sha256('two-line-payment'),
      } });
      await tx.fulfillment.create({ data: { orderId: order.id } });
    });
    const started = await fulfillmentCommands.execute(order.id, 'start', {
      actorId: staffUser, requestId: `${requestIdPrefix}-two-start`, idempotencyKey: `two-start-${runId}`,
    });
    await expect(shipments.dispatch(order.id, { carrier: 'post', trackingCode: `EARLY-${runId}` }, {
      actorId: staffUser, requestId: `${requestIdPrefix}-early-dispatch`, idempotencyKey: `early-dispatch-${runId}`,
    })).rejects.toMatchObject({ response: { code: 'SHIPMENT_STATE_CONFLICT' } });
    const items = await prisma.orderItem.findMany({ where: { orderId: order.id }, orderBy: { ordinal: 'asc' } });
    await fulfillmentPicks.record(order.id, items[0].id, items[0].quantity, {
      actorId: staffUser, requestId: `${requestIdPrefix}-two-pick-one`, idempotencyKey: `two-pick-one-${runId}`,
    });
    await expect(fulfillmentCommands.execute(order.id, 'ready', {
      actorId: staffUser, requestId: `${requestIdPrefix}-two-ready-early`, idempotencyKey: `two-ready-early-${runId}`,
    })).rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });
    await fulfillmentPicks.record(order.id, items[1].id, items[1].quantity, {
      actorId: staffUserTwo, requestId: `${requestIdPrefix}-two-pick-two`, idempotencyKey: `two-pick-two-${runId}`,
    });
    await expect(fulfillmentCommands.execute(order.id, 'ready', {
      actorId: staffUser, requestId: `${requestIdPrefix}-two-ready`, idempotencyKey: `two-ready-${runId}`,
    })).resolves.toMatchObject({ data: { fulfillment: { id: started.data.fulfillment.id, status: 'READY_TO_SHIP' } } });
    await expect(fulfillmentPicks.record(order.id, items[0].id, items[0].quantity, {
      actorId: staffUser, requestId: `${requestIdPrefix}-two-late-pick`, idempotencyKey: `two-late-pick-${runId}`,
    })).rejects.toMatchObject({ response: { code: 'FULFILLMENT_STATE_CONFLICT' } });

    const foreign = await createPendingOrderWithLines(otherCustomerId, [
      { variantId: variantAId, locationId: locationAId, quantity: 1 },
    ]);
    const foreignItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: foreign.id } });
    await expect(prisma.fulfillmentPick.create({ data: {
      fulfillmentId: started.data.fulfillment.id, orderItemId: foreignItem.id,
      quantity: foreignItem.quantity, actorId: staffUser, requestId: `${requestIdPrefix}-foreign-db-pick`,
    } })).rejects.toThrow();

    await expect(delivery.confirm(order.id, { proofReference: `PROOF-${runId}` }, {
      actorId: staffUser, requestId: `${requestIdPrefix}-early-delivery`, idempotencyKey: `early-delivery-${runId}`,
    })).rejects.toMatchObject({ response: { code: 'SHIPMENT_STATE_CONFLICT' } });

    const dispatchContext = { actorId: staffUser, requestId: `${requestIdPrefix}-dispatch`, idempotencyKey: `dispatch-${runId}` };
    const body = { carrier: 'post', trackingCode: `PKG-${runId}` };
    const [dispatched, replay] = await Promise.all([
      shipments.dispatch(order.id, body, dispatchContext),
      shipments.dispatch(order.id, body, { ...dispatchContext, requestId: `${requestIdPrefix}-dispatch-replay` }),
    ]);
    expect(replay).toEqual(dispatched);
    expect(dispatched.data.shipment.status).toBe('SHIPPED');
    const stored = await prisma.shipment.findUniqueOrThrow({ where: { orderId: order.id }, include: { lines: true } });
    expect(stored.lines).toHaveLength(2);
    const source = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { addressSnapshot: true } });
    expect(stored.addressSnapshot).toEqual(source.addressSnapshot);
    await expect(orderReads.getCustomerOrder(customerUser, order.id))
      .resolves.toMatchObject({ data: { order: { shipment: { trackingCode: body.trackingCode } } } });
    await expect(orderReads.getCustomerOrder(otherUser, order.id))
      .rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    await expect(prisma.fulfillment.findUniqueOrThrow({ where: { id: started.data.fulfillment.id } }))
      .resolves.toMatchObject({ status: 'SHIPPED' });
    await expect(shipments.dispatch(order.id, { ...body, trackingCode: 'CHANGED' }, dispatchContext))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(shipments.dispatch(order.id, body, { ...dispatchContext, idempotencyKey: `dispatch-again-${runId}` }))
      .rejects.toMatchObject({ response: { code: 'SHIPMENT_STATE_CONFLICT' } });
    await expect(prisma.shipmentLine.create({ data: {
      shipmentId: stored.id, orderItemId: foreignItem.id, quantity: foreignItem.quantity,
    } })).rejects.toThrow();
    await expect(prisma.auditLog.count({ where: { entityId: stored.id, action: 'shipment.dispatch' } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { topic: 'SHIPMENT_DISPATCHED', aggregateId: order.id } })).resolves.toBe(1);

    const deliveryContext = { actorId: staffUser, requestId: `${requestIdPrefix}-delivery`, idempotencyKey: `delivery-${runId}` };
    const proofReference = `PROOF-${runId}`;
    const [confirmed, deliveryReplay] = await Promise.all([
      delivery.confirm(order.id, { proofReference }, deliveryContext),
      delivery.confirm(order.id, { proofReference }, { ...deliveryContext, requestId: `${requestIdPrefix}-delivery-replay` }),
    ]);
    expect(deliveryReplay).toEqual(confirmed);
    expect(confirmed.data.delivery).toMatchObject({ shipmentId: stored.id, status: 'DELIVERED', proofReference });
    expect(new Date(confirmed.data.delivery.confirmedAt).getTime()).toBeGreaterThan(0);
    await expect(orderReads.getCustomerOrder(customerUser, order.id))
      .resolves.toMatchObject({ data: { order: { shipment: { status: 'DELIVERED' }, fulfillmentStatus: 'DELIVERED' } } });
    await expect(delivery.confirm(order.id, { proofReference: 'OTHER-REF' }, deliveryContext))
      .rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    await expect(delivery.confirm(order.id, { proofReference }, { ...deliveryContext, idempotencyKey: `delivery-again-${runId}` }))
      .rejects.toMatchObject({ response: { code: 'SHIPMENT_STATE_CONFLICT' } });
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillmentId: started.data.fulfillment.id, to: 'DELIVERED' } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { entityId: stored.id, action: 'shipment.delivery.confirm' } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { topic: 'SHIPMENT_DELIVERED', aggregateId: order.id } })).resolves.toBe(1);
  });

  function afterCandidateSelection(intervene: () => Promise<void>) {
    // All reads and writes remain real PostgreSQL operations. Only their interleaving is controlled.
    const client = prisma.$extends({ query: { order: {
      async findMany({ args, query }) {
        const candidates = await query(args);
        expect(candidates).toHaveLength(1);
        await intervene();
        return candidates;
      },
    } } });
    return new OrderCommandService(client as unknown as PrismaService, audit, inventory);
  }

  async function assertPreserved(orderId: string, balanceBefore: { id: string; onHand: number; reserved: number; available: number; version: number }) {
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PENDING_PAYMENT');
    expect(await prisma.stockReservation.count({ where: { orderId, status: 'ACTIVE' } })).toBe(1);
    expect(await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: balanceBefore.id } })).toEqual(balanceBefore);
    expect(await prisma.orderTransition.count({ where: { orderId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: orderId, action: 'order.expired' } })).toBe(0);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: orderId } })).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { referenceType: 'order', referenceId: orderId } })).toBe(0);
  }

  async function makeOverdue(orderId: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
  }

  async function runExpiry(orderId: string) {
    await makeOverdue(orderId);
    await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: `${requestIdPrefix}-expire-fixture` },
      { now: new Date() },
    );
  }

  async function createPendingOrderWithLines(
    ownerCustomerId: string,
    lines: Array<{ variantId: string; locationId: string; quantity: number }>,
  ) {
    const suffix = ownerCustomerId === customerId ? 'a' : 'b';
    const orderId = `${requestIdPrefix}-order-${suffix}`;
    const number = `ORDCMD-${runId}-${suffix}`;
    const future = new Date(Date.now() + 1_800_000);
    await prisma.order.create({
      data: {
        id: orderId,
        number,
        customerId: ownerCustomerId,
        status: 'PENDING_PAYMENT',
        subtotal: 100n,
        discount: 0n,
        shipping: 50n,
        grandTotal: 150n,
        addressSnapshot: { test: true },
        shippingMethod: 'STANDARD',
        shippingMethodTitle: 'Standard shipping',
        shippingPolicyRevision: 'shipping-standard-v1',
        pricePolicyRevision: 'catalog-sale-price-v1',
        reservationExpiresAt: future,
      },
    });
    for (const [ordinal, line] of lines.entries()) {
      await prisma.orderItem.create({ data: {
        orderId, variantId: line.variantId,
        sku: line.variantId === variantAId ? `ORDCMD-A-${runId}` : `ORDCMD-B-${runId}`,
        title: 'Order command product', productTitle: 'Order command product',
        ordinal, quantity: line.quantity, unitPrice: 100n, total: BigInt(line.quantity) * 100n,
      } });
      await prisma.inventoryBalance.upsert({
        where: {
          warehouseId_locationId_variantId: {
            warehouseId,
            locationId: line.locationId,
            variantId: line.variantId,
          },
        },
        create: {
          warehouseId,
          locationId: line.locationId,
          variantId: line.variantId,
          onHand: line.quantity,
          reserved: line.quantity,
          available: 0,
          version: 1,
        },
        update: {
          onHand: line.quantity,
          reserved: line.quantity,
          available: 0,
          version: { increment: 1 },
        },
      });
      await prisma.stockReservation.create({
        data: {
          orderId,
          warehouseId,
          locationId: line.locationId,
          variantId: line.variantId,
          quantity: line.quantity,
          status: 'ACTIVE',
          expiresAt: future,
        },
      });
    }
    return { id: orderId, number };
  }

  async function reservedIds(orderId: string): Promise<string[]> {
    const reservations = await prisma.stockReservation.findMany({
      where: { orderId },
      select: { id: true },
    });
    return reservations.map((reservation) => reservation.id);
  }

  async function resetState() {
    await prisma.shipmentLine.deleteMany({ where: { shipment: { order: { customerId: { in: [customerId, otherCustomerId] } } } } });
    await prisma.shipment.deleteMany({ where: { order: { customerId: { in: [customerId, otherCustomerId] } } } });
    await prisma.fulfillmentPick.deleteMany({
      where: { fulfillment: { order: { customerId: { in: [customerId, otherCustomerId] } } } },
    });
    await prisma.fulfillmentTransition.deleteMany({
      where: { fulfillment: { order: { customerId: { in: [customerId, otherCustomerId] } } } },
    });
    await prisma.fulfillment.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.orderTransition.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.orderCommandIdempotencyRecord.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.paymentTransition.deleteMany({
      where: { payment: { order: { customerId: { in: [customerId, otherCustomerId] } } } },
    });
    await prisma.payment.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.stockReservation.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    const orderIds = (
      await prisma.order.findMany({
        where: { customerId: { in: [customerId, otherCustomerId] } },
        select: { id: true },
      })
    ).map((order) => order.id);
    if (orderIds.length > 0) {
      await prisma.inventoryMovement.deleteMany({
        where: { referenceType: 'order', referenceId: { in: orderIds } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: orderIds } },
      });
    }
    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.inventoryBalance.upsert({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId,
          locationId: locationAId,
          variantId: variantAId,
        },
      },
      create: {
        warehouseId,
        locationId: locationAId,
        variantId: variantAId,
        onHand: 0,
        reserved: 0,
        available: 0,
        version: 1,
      },
      update: { onHand: 0, reserved: 0, available: 0, version: { increment: 1 } },
    });
    await prisma.inventoryBalance.upsert({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId,
          locationId: locationBId,
          variantId: variantAId,
        },
      },
      create: {
        warehouseId,
        locationId: locationBId,
        variantId: variantAId,
        onHand: 0,
        reserved: 0,
        available: 0,
        version: 1,
      },
      update: { onHand: 0, reserved: 0, available: 0, version: { increment: 1 } },
    });
    await prisma.inventoryBalance.upsert({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId,
          locationId: locationBId,
          variantId: variantBId,
        },
      },
      create: {
        warehouseId,
        locationId: locationBId,
        variantId: variantBId,
        onHand: 0,
        reserved: 0,
        available: 0,
        version: 1,
      },
      update: { onHand: 0, reserved: 0, available: 0, version: { increment: 1 } },
    });
    await prisma.order.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
  }
});
