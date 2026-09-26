import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
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
  });

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
