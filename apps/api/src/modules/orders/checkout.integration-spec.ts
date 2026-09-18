import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AuditLogService } from '../audit/audit-log.service';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
  combinationSignature,
} from '../catalog/variant-identifiers';
import { CheckoutService } from './checkout.service';
import { ConfiguredShippingQuoteAdapter } from './configured-shipping-quote.adapter';

describe.sequential('CheckoutService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `checkout_user_${runId}`;
  const otherUserId = `checkout_other_${runId}`;
  const customerId = `checkout_customer_${runId}`;
  const otherCustomerId = `checkout_other_customer_${runId}`;
  const productId = `checkout_product_${runId}`;
  const variantAId = `checkout_variant_a_${runId}`;
  const variantBId = `checkout_variant_b_${runId}`;
  const warehouseId = `checkout_warehouse_${runId}`;
  const locationAId = `checkout_location_a_${runId}`;
  const locationBId = `checkout_location_b_${runId}`;
  const shippingMethodId = `checkout_shipping_${runId}`;
  const requestIdPrefix = `checkout-${runId}`;
  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const shipping = new ConfiguredShippingQuoteAdapter(prisma);
  const checkout = new CheckoutService(prisma, audit, shipping);
  let connected = false;

  const address = {
    provinceCode: 'teh',
    city: ' تهران ',
    address: 'خیابان نمونه پلاک ۱',
    postalCode: '۱۲۳۴۵۶۷۸۹۰',
    recipient: 'کاربر نمونه',
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
        {
          id: userId,
          email: `checkout-${runId}@example.test`,
          status: 'ACTIVE',
          isEmailVerified: true,
          createdAt: new Date(Date.now() - 60_000),
          emailVerifiedAt: new Date(),
        },
        {
          id: otherUserId,
          email: `checkout-other-${runId}@example.test`,
          status: 'ACTIVE',
          isEmailVerified: true,
          createdAt: new Date(Date.now() - 60_000),
          emailVerifiedAt: new Date(),
        },
      ],
    });
    await prisma.customer.createMany({
      data: [
        {
          id: customerId,
          userId,
          mobile: `+989${numericSuffix(runId, 0)}`,
        },
        {
          id: otherCustomerId,
          userId: otherUserId,
          mobile: `+989${numericSuffix(runId, 1)}`,
        },
      ],
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'Checkout integration product',
        slug: `checkout-integration-${runId}`,
        status: 'ACTIVE',
      },
    });
    await prisma.productVariant.createMany({
      data: [
        {
          id: variantAId,
          productId,
          sku: `CHK-A-${runId}`,
          skuKey: canonicalizeSku(`CHK-A-${runId}`),
          combinationSignature: EMPTY_AXIS_SIGNATURE,
          title: 'Variant A',
          costPrice: 80000n,
          salePrice: 100000n,
          status: 'ACTIVE',
          isActive: true,
        },
        {
          id: variantBId,
          productId,
          sku: `CHK-B-${runId}`,
          skuKey: canonicalizeSku(`CHK-B-${runId}`),
          combinationSignature: combinationSignature([
            { attributeId: 'checkout-axis', optionId: 'checkout-option-b' },
          ]),
          title: 'Variant B',
          costPrice: 160000n,
          salePrice: 200000n,
          status: 'ACTIVE',
          isActive: true,
        },
      ],
    });
    await prisma.warehouse.create({
      data: {
        id: warehouseId,
        code: `CHK-WH-${runId}`,
        name: 'Checkout warehouse',
      },
    });
    await prisma.warehouseLocation.createMany({
      data: [
        { id: locationAId, warehouseId, code: 'A-01', name: 'A' },
        { id: locationBId, warehouseId, code: 'B-01', name: 'B' },
      ],
    });
    await prisma.shippingMethod.create({
      data: {
        id: shippingMethodId,
        code: 'STANDARD',
        title: 'Standard shipping',
        amount: 50000n,
        policyRevision: 'test-flat-rate-v1',
      },
    });
  });

  beforeEach(async () => {
    await resetCheckoutState();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetCheckoutState();
    await prisma.shippingMethod.deleteMany({ where: { id: shippingMethodId } });
    await prisma.inventoryBalance.deleteMany({
      where: { variantId: { in: [variantAId, variantBId] } },
    });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerId, otherCustomerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.$disconnect();
  });

  it('creates one immutable order, deterministic reservations and outbox event', async () => {
    await seedCart(customerId, [
      { variantId: variantAId, quantity: 3 },
      { variantId: variantBId, quantity: 1 },
    ]);
    await seedBalance(variantAId, locationAId, 2);
    await seedBalance(variantAId, locationBId, 3);
    await seedBalance(variantBId, locationBId, 1);
    const quote = await preview(userId);
    const successRequestId = `${requestIdPrefix}-${'x'.repeat(
      128 - requestIdPrefix.length - 1,
    )}`;

    const result = await checkout.createForUser(
      userId,
      { address, shippingQuoteId: quote.quoteId },
      `success-${runId}`,
      successRequestId,
    );

    expect(result.data.order).toMatchObject({
      status: 'PENDING_PAYMENT',
      subtotal: { amount: '500000', currency: 'IRR' },
      shipping: { amount: '50000', currency: 'IRR' },
      total: { amount: '550000', currency: 'IRR' },
      address: {
        provinceCode: 'TEH',
        city: 'تهران',
        postalCode: '1234567890',
        mobile: '+989123456789',
      },
    });
    expect(result.data.reservations).toHaveLength(3);
    expect(result.data.reservations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locationId: expect.anything() }),
      ]),
    );
    const persistedReservations = await prisma.stockReservation.findMany({
      where: { orderId: result.data.order.id },
      select: { locationId: true, quantity: true },
      orderBy: [{ location: { code: 'asc' } }, { variantId: 'asc' }],
    });
    expect(persistedReservations).toEqual([
      { locationId: locationAId, quantity: 2 },
      { locationId: locationBId, quantity: 1 },
      { locationId: locationBId, quantity: 1 },
    ]);
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.outboxEvent.count({
        where: { aggregateId: result.data.order.id },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.cartItem.count({ where: { cart: { customerId } } }),
    ).resolves.toBe(0);

    const persistedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: result.data.order.id },
      include: {
        items: { orderBy: { ordinal: 'asc' } },
        transitions: true,
      },
    });
    expect(persistedOrder).toMatchObject({
      status: 'PENDING_PAYMENT',
      shippingMethod: 'STANDARD',
      shippingMethodTitle: 'Standard shipping',
      items: [{ ordinal: 0 }, { ordinal: 1 }],
      transitions: [
        {
          from: 'DRAFT',
          to: 'PENDING_PAYMENT',
          reason: 'CHECKOUT_COMPLETED',
          actorId: userId,
          requestId: successRequestId,
        },
      ],
    });
    await expect(
      prisma.auditLog.count({ where: { requestId: successRequestId } }),
    ).resolves.toBe(4);

    await prisma.productVariant.update({
      where: { id: variantAId },
      data: { salePrice: 999999n },
    });
    await prisma.shippingMethod.update({
      where: { id: shippingMethodId },
      data: { title: 'Renamed shipping' },
    });
    const snapshot = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: result.data.order.id, variantId: variantAId },
    });
    expect(snapshot.unitPrice).toBe(100000n);
    expect(snapshot.productTitle).toBe('Checkout integration product');
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: result.data.order.id } }),
    ).resolves.toMatchObject({ shippingMethodTitle: 'Standard shipping' });
  });

  it('replays the original response and rejects a changed payload', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const quote = await preview(userId);
    const key = `replay-${runId}`;

    const first = await checkout.createForUser(
      userId,
      { address, shippingQuoteId: quote.quoteId },
      key,
      `${requestIdPrefix}-replay-first`,
    );
    const replay = await checkout.createForUser(
      userId,
      { address, shippingQuoteId: quote.quoteId },
      key,
      `${requestIdPrefix}-replay-second`,
    );
    expect(replay).toEqual(first);
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      1,
    );

    await expect(
      checkout.createForUser(
        userId,
        {
          address: { ...address, city: 'قم' },
          shippingQuoteId: quote.quoteId,
        },
        key,
        `${requestIdPrefix}-replay-conflict`,
      ),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('rolls back the whole workflow when a later line is out of stock', async () => {
    await seedCart(customerId, [
      { variantId: variantAId, quantity: 1 },
      { variantId: variantBId, quantity: 2 },
    ]);
    await seedBalance(variantAId, locationAId, 2);
    await seedBalance(variantBId, locationBId, 1);
    const quote = await preview(userId);

    await expect(
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        `rollback-${runId}`,
        `${requestIdPrefix}-rollback`,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });

    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.stockReservation.count({
        where: { variantId: { in: [variantAId, variantBId] } },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.outboxEvent.count({ where: { aggregateType: 'order' } }),
    ).resolves.toBe(0);
    await expect(
      prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          warehouseId_locationId_variantId: {
            warehouseId,
            locationId: locationAId,
            variantId: variantAId,
          },
        },
      }),
    ).resolves.toMatchObject({ reserved: 0, available: 2 });
  });

  it('rejects stale and foreign-customer shipping quotes without side effects', async () => {
    const cart = await seedCart(customerId, [
      { variantId: variantAId, quantity: 1 },
    ]);
    await seedBalance(variantAId, locationAId, 3);
    const quote = await preview(userId);
    await prisma.cart.update({
      where: { id: cart.id },
      data: { version: { increment: 1 } },
    });

    await expect(
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        `stale-${runId}`,
        `${requestIdPrefix}-stale`,
      ),
    ).rejects.toMatchObject({ response: { code: 'SHIPPING_QUOTE_CHANGED' } });

    await seedCart(otherCustomerId, [{ variantId: variantAId, quantity: 1 }]);
    await expect(
      checkout.createForUser(
        otherUserId,
        { address, shippingQuoteId: quote.quoteId },
        `foreign-${runId}`,
        `${requestIdPrefix}-foreign`,
      ),
    ).rejects.toMatchObject({ response: { code: 'SHIPPING_QUOTE_CHANGED' } });
    await expect(prisma.order.count()).resolves.toBe(0);
  });

  it('rejects a catalog price change and keeps the cart and stock untouched', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const quote = await preview(userId);
    await prisma.productVariant.update({
      where: { id: variantAId },
      data: { salePrice: 110000n },
    });

    await expect(
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        `price-change-${runId}`,
        `${requestIdPrefix}-price-change`,
      ),
    ).rejects.toMatchObject({ response: { code: 'QUOTE_CHANGED' } });
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      0,
    );
    await expect(
      prisma.cartItem.count({ where: { cart: { customerId } } }),
    ).resolves.toBe(1);
    await expect(
      prisma.inventoryBalance.findUniqueOrThrow({
        where: {
          warehouseId_locationId_variantId: {
            warehouseId,
            locationId: locationAId,
            variantId: variantAId,
          },
        },
      }),
    ).resolves.toMatchObject({ reserved: 0, available: 2 });
  });

  it('rejects a shipping-method presentation change even without a revision bump', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const quote = await preview(userId);
    await prisma.shippingMethod.update({
      where: { id: shippingMethodId },
      data: { title: 'Changed after quote' },
    });

    await expect(
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        `shipping-change-${runId}`,
        `${requestIdPrefix}-shipping-change`,
      ),
    ).rejects.toMatchObject({ response: { code: 'SHIPPING_QUOTE_CHANGED' } });
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      0,
    );
  });

  it('fails closed when no operator-configured shipping method is active', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    await prisma.shippingMethod.update({
      where: { id: shippingMethodId },
      data: { isActive: false },
    });

    await expect(checkout.previewForUser(userId, address)).rejects.toMatchObject({
      response: { code: 'SHIPPING_QUOTE_CHANGED' },
    });
    await expect(prisma.shippingQuote.count({ where: { customerId } })).resolves.toBe(
      0,
    );
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      0,
    );
  });

  it('excludes inactive locations from public availability and allocation', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 2 }]);
    await seedBalance(variantAId, locationAId, 1);
    await seedBalance(variantAId, locationBId, 10);
    await prisma.warehouseLocation.update({
      where: { id: locationBId },
      data: { isActive: false },
    });

    const previewResult = await checkout.previewForUser(userId, address);
    expect(previewResult.data.cart.lines[0]?.available).toBe(1);
    const quote = previewResult.data.shipping[0];
    expect(quote).toBeDefined();

    await expect(
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote!.quoteId },
        `inactive-location-${runId}`,
        `${requestIdPrefix}-inactive-location`,
      ),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      0,
    );
  });

  it('coalesces concurrent identical submissions into one order', async () => {
    await seedCart(customerId, [{ variantId: variantAId, quantity: 1 }]);
    await seedBalance(variantAId, locationAId, 2);
    const quote = await preview(userId);
    const key = `concurrent-${runId}`;

    const [first, second] = await Promise.all([
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        key,
        `${requestIdPrefix}-concurrent-a`,
      ),
      checkout.createForUser(
        userId,
        { address, shippingQuoteId: quote.quoteId },
        key,
        `${requestIdPrefix}-concurrent-b`,
      ),
    ]);

    expect(first.data.order.id).toBe(second.data.order.id);
    await expect(prisma.order.count({ where: { customerId } })).resolves.toBe(
      1,
    );
    await expect(
      prisma.stockReservation.count({
        where: { orderId: first.data.order.id },
      }),
    ).resolves.toBe(1);
  });

  it('enforces checkout quantities and money invariants in PostgreSQL', async () => {
    await expect(
      prisma.shippingMethod.create({
        data: {
          code: `NEG-${runId}`,
          title: 'Invalid',
          amount: -1n,
          policyRevision: 'invalid',
        },
      }),
    ).rejects.toBeDefined();

    await seedBalance(variantAId, locationAId, 1);
    await expect(
      prisma.stockReservation.create({
        data: {
          warehouseId,
          locationId: locationAId,
          variantId: variantAId,
          quantity: 0,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toBeDefined();

    await expect(
      prisma.order.create({
        data: {
          number: `INVALID-${runId}`,
          customerId,
          subtotal: 100n,
          discount: 0n,
          shipping: 50n,
          grandTotal: 149n,
          addressSnapshot: { test: true },
          shippingMethod: 'STANDARD',
          shippingMethodTitle: 'Standard shipping',
          shippingPolicyRevision: 'test-flat-rate-v1',
          pricePolicyRevision: 'catalog-sale-price-v1',
          reservationExpiresAt: new Date(Date.now() + 60_000),
        },
      }),
    ).rejects.toBeDefined();
  });

  async function preview(forUserId: string) {
    const result = await checkout.previewForUser(forUserId, address);
    expect(result.data.shipping).toHaveLength(1);
    return result.data.shipping[0];
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

  async function resetCheckoutState() {
    await prisma.checkoutIdempotencyRecord.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.shippingQuote.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.stockReservation.deleteMany({
      where: { variantId: { in: [variantAId, variantBId] } },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateType: 'order',
        payload: { path: ['customerId'], equals: customerId },
      },
    });
    await prisma.orderTransition.deleteMany({
      where: { order: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.order.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.cartItem.deleteMany({
      where: { cart: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.cart.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { requestId: { startsWith: requestIdPrefix } },
    });
    await prisma.inventoryBalance.deleteMany({
      where: { variantId: { in: [variantAId, variantBId] } },
    });
    await prisma.productVariant.updateMany({
      where: { id: { in: [variantAId, variantBId] } },
      data: { status: 'ACTIVE', isActive: true },
    });
    await prisma.productVariant.updateMany({
      where: { id: variantAId },
      data: { salePrice: 100000n },
    });
    await prisma.productVariant.updateMany({
      where: { id: variantBId },
      data: { salePrice: 200000n },
    });
    await prisma.warehouse.update({
      where: { id: warehouseId },
      data: { isActive: true },
    });
    await prisma.warehouseLocation.updateMany({
      where: { warehouseId },
      data: { isActive: true },
    });
    await prisma.shippingMethod.update({
      where: { id: shippingMethodId },
      data: {
        code: 'STANDARD',
        title: 'Standard shipping',
        amount: 50000n,
        policyRevision: 'test-flat-rate-v1',
        isActive: true,
      },
    });
  }
});

function numericSuffix(value: string, increment: number): string {
  const numeric = Number.parseInt(value.slice(0, 8), 16) % 1_000_000_000;
  return ((numeric + increment) % 1_000_000_000).toString().padStart(9, '0');
}
