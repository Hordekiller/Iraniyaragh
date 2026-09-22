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
import { CheckoutService } from './checkout.service';
import { ConfiguredShippingQuoteAdapter } from './configured-shipping-quote.adapter';
import { OrderCommandService } from './order-command.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
  const shippingMethodId = `ordcmd_shipping_${runId}`;
  const requestIdPrefix = `ordcmd-${runId}`;
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const checkout = new CheckoutService(prisma, audit, shipping);
  const inventory = new InventoryService(prisma, audit);
  const commands = new OrderCommandService(prisma, audit, inventory);
  let connected = false;

  const address = {
    provinceCode: 'teh',
    city: ' تهران ',
    address: 'خیابان آزادی، پلاک ۱۰',
    postalCode: '۱۲۳۴۵۶۷۸۹۰',
    recipient: 'گیرنده دستور سفارش',
    mobile: '۰۹۱۲۳۴۵۶۷۸۹',
  };

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
    await prisma.shippingMethod.create({
      data: { id: shippingMethodId, code: 'STANDARD', title: 'Standard shipping', amount: 50000n, policyRevision: 'shipping-standard-v1' },
    });
  });

  beforeEach(async () => {
    await resetState();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetState();
    await prisma.shippingMethod.deleteMany({ where: { id: shippingMethodId } });
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
    await seedCart(customerId, [
      { variantId: variantAId, quantity: 3 },
      { variantId: variantBId, quantity: 1 },
    ]);
    await seedBalance(variantAId, locationAId, 2);
    await seedBalance(variantAId, locationBId, 3);
    await seedBalance(variantBId, locationBId, 1);
    const order = await createPendingOrder(customerUser, customerId);
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
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(customerUser, customerId);
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
    await expect(prisma.orderTransition.count({ where: { orderId: order.id } })).resolves.toBe(2);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_CANCELLED' } })).resolves.toBe(1);
    await expect(prisma.auditLog.count({ where: { action: 'order.cancelled', entityId: order.id } })).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(1);
  });

  it('rejects reusing a staff cancel key with a different actor payload', async () => {
    await seedCart(otherCustomerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(otherUser, otherCustomerId);
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
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(customerUser, customerId);

    await expect(
      commands.cancelAsCustomer(otherUser, order.id, {
        idempotencyKey: `foreign-${runId}`,
        requestId: `${requestIdPrefix}-foreign`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });

    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(1);
    await expect(prisma.orderCommandIdempotencyRecord.count({ where: { orderId: order.id } })).resolves.toBe(0);
  });

  it('lets staff cancel a pending order without a customer profile link', async () => {
    await seedCart(otherCustomerId, [{ variantId: variantBId, quantity: 1 }]);
    await seedBalance(variantBId, locationBId, 1);
    const order = await createPendingOrder(otherUser, otherCustomerId);
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
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(customerUser, customerId);
    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
    await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: `${requestIdPrefix}-expire-first` },
      { now: new Date() },
    );

    await expect(
      commands.cancelAsCustomer(customerUser, order.id, {
        idempotencyKey: `late-cancel-${runId}`,
        requestId: `${requestIdPrefix}-late-cancel`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_STATE_CONFLICT' } });
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id, topic: 'ORDER_CANCELLED' } })).resolves.toBe(0);
  });

  it('expires overdue pending orders once and idempotently returns zero on a later run', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(customerUser, customerId);
    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
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
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const order = await createPendingOrder(customerUser, customerId);
    await prisma.order.update({
      where: { id: order.id },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });

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

  async function createPendingOrder(
    forUserId: string,
    forCustomerId: string,
  ) {
    const quote = await preview(forUserId);
    const result = await checkout.createForUser(
      forUserId,
      { address, shippingQuoteId: quote.quoteId },
      `${forCustomerId}-${runId}`,
      `${requestIdPrefix}-${forCustomerId}`,
    );
    return result.data.order;
  }

  async function preview(forUserId: string) {
    const result = await checkout.previewForUser(forUserId, address);
    expect(result.data.shipping).toHaveLength(1);
    return result.data.shipping[0];
  }

  async function reservedIds(orderId: string): Promise<string[]> {
    const reservations = await prisma.stockReservation.findMany({
      where: { orderId },
      select: { id: true },
    });
    return reservations.map((reservation) => reservation.id);
  }

  async function seedCart(
    ownerCustomerId: string,
    items: Array<{ variantId: string; quantity: number }>,
  ) {
    const cart = await prisma.cart.upsert({
      where: { customerId: ownerCustomerId },
      create: { customerId: ownerCustomerId },
      update: { version: { increment: 1 } },
    });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.createMany({
      data: items.map((item) => ({ cartId: cart.id, ...item })),
    });
    return cart;
  }

  async function seedBalance(
    variantId: string,
    locationId: string,
    onHand: number,
  ) {
    await prisma.inventoryBalance.upsert({
      where: {
        warehouseId_locationId_variantId: {
          warehouseId,
          locationId,
          variantId,
        },
      },
      create: {
        warehouseId,
        locationId,
        variantId,
        onHand,
        reserved: 0,
        available: onHand,
        version: 1,
      },
      update: {
        onHand,
        reserved: 0,
        available: onHand,
        version: { increment: 1 },
      },
    });
  }

  async function resetState() {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { startsWith: 'ordcmd' } },
    });
    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.orderTransition.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.orderCommandIdempotencyRecord.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.cartItem.deleteMany({
      where: { cart: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.cart.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.stockReservation.deleteMany({
      where: {
        OR: [
          { orderId: { startsWith: 'ordcmd' } },
          { variantId: { in: [variantAId, variantBId] } },
        ],
      },
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
    await prisma.checkoutIdempotencyRecord.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.shippingQuote.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.order.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
  }
});

function numericSuffix(value: string, increment: number): string {
  return String(parseInt(value, 10) + increment).padStart(10, '0');
}