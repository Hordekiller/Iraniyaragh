import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { OrderReadService } from './order-read.service';

describe.sequential('OrderReadService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const ownerUserId = `order_read_owner_user_${runId}`;
  const otherUserId = `order_read_other_user_${runId}`;
  const staffUserId = `order_read_staff_user_${runId}`;
  const ownerCustomerId = `order_read_owner_${runId}`;
  const otherCustomerId = `order_read_other_${runId}`;
  const productId = `order_read_product_${runId}`;
  const variantId = `order_read_variant_${runId}`;
  const ownerOrderId = `order_read_order_owner_${runId}`;
  const olderOrderId = `order_read_order_older_${runId}`;
  const otherOrderId = `order_read_order_other_${runId}`;
  const prisma = new PrismaService();
  const service = new OrderReadService(prisma);
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
        {
          id: ownerUserId,
          mobile: testMobile(runId, 1),
          firstName: 'مریم',
          lastName: 'احمدی',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 60_000),
          isMobileVerified: true,
          mobileVerifiedAt: new Date(),
        },
        {
          id: otherUserId,
          mobile: testMobile(runId, 2),
          firstName: 'کاربر',
          lastName: 'دیگر',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 60_000),
          isMobileVerified: true,
          mobileVerifiedAt: new Date(),
        },
        {
          id: staffUserId,
          email: `orders-read-${runId}@example.test`,
          firstName: 'اپراتور',
          lastName: 'سفارش',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 60_000),
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
      ],
    });
    await prisma.customer.createMany({
      data: [
        {
          id: ownerCustomerId,
          userId: ownerUserId,
          mobile: testMobile(runId, 3),
          firstName: 'مریم',
          lastName: 'احمدی',
        },
        {
          id: otherCustomerId,
          userId: otherUserId,
          mobile: testMobile(runId, 4),
          firstName: 'کاربر',
          lastName: 'دیگر',
        },
      ],
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'لولا آرام‌بند کابینت',
        slug: `order-read-product-${runId}`,
        status: 'ACTIVE',
      },
    });
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId,
        sku: `ORD-READ-${runId}`,
        skuKey: `ord-read-${runId}`,
        combinationSignature: 'order-read-default',
        title: 'نقره‌ای',
        costPrice: 125000n,
        salePrice: 175000n,
        status: 'ACTIVE',
      },
    });

    const baseDate = new Date('2026-09-18T07:00:00.000Z');
    await createOrder({
      id: olderOrderId,
      customerId: ownerCustomerId,
      number: `ORD-${runId}-001`,
      createdAt: baseDate,
      status: 'DRAFT',
      total: 175000n,
    });
    await createOrder({
      id: ownerOrderId,
      customerId: ownerCustomerId,
      number: `ORD-${runId}-002`,
      createdAt: new Date(baseDate.getTime() + 60_000),
      status: 'PENDING_PAYMENT',
      total: 400000n,
      quantity: 2,
    });
    await createOrder({
      id: otherOrderId,
      customerId: otherCustomerId,
      number: `ORD-${runId}-003`,
      createdAt: new Date(baseDate.getTime() + 120_000),
      status: 'PAID',
      total: 175000n,
    });

    const payment = await prisma.payment.create({
      data: {
        id: `order_read_payment_${runId}`,
        orderId: ownerOrderId,
        provider: 'production-provider-contract',
        amount: 400000n,
        status: 'FAILED',
        authority: 'sensitive-authority-not-public',
        referenceId: 'sensitive-reference-not-public',
        idempotencyKey: `order-read-payment-${runId}`,
        idempotencyFingerprint: 'a'.repeat(64),
        correlationId: `order-read-payment-correlation-${runId}`,
        gatewayEnvironment: 'sandbox',
        createdAt: new Date(baseDate.getTime() + 70_000),
      },
    });
    await prisma.paymentTransition.create({
      data: {
        paymentId: payment.id,
        from: 'PENDING',
        to: 'FAILED',
        reason: 'Provider verification failed',
        actorId: staffUserId,
        requestId: `order-read-payment-request-${runId}`,
        createdAt: new Date(baseDate.getTime() + 80_000),
      },
    });
    const fulfillment = await prisma.fulfillment.create({
      data: {
        id: `order_read_fulfillment_${runId}`,
        orderId: ownerOrderId,
        status: 'PROCESSING',
        createdAt: new Date(baseDate.getTime() + 90_000),
      },
    });
    await prisma.fulfillmentTransition.create({
      data: {
        fulfillmentId: fulfillment.id,
        from: 'PENDING',
        to: 'PROCESSING',
        reason: 'Warehouse accepted the order',
        actorId: staffUserId,
        requestId: `order-read-fulfillment-request-${runId}`,
        createdAt: new Date(baseDate.getTime() + 100_000),
      },
    });
    await prisma.orderTransition.create({
      data: {
        orderId: ownerOrderId,
        from: 'DRAFT',
        to: 'PENDING_PAYMENT',
        reason: 'Checkout completed',
        actorId: ownerUserId,
        requestId: `order-read-order-request-${runId}`,
        createdAt: new Date(baseDate.getTime() + 65_000),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorId: staffUserId,
        action: 'order.read.integration-evidence',
        entityType: 'order',
        entityId: ownerOrderId,
        requestId: `order-read-audit-request-${runId}`,
        before: { secret: 'must-not-leave-persistence' },
        after: { authority: 'must-not-leave-persistence' },
        metadata: { warehouseLocationId: 'must-not-leave-persistence' },
        createdAt: new Date(baseDate.getTime() + 110_000),
      },
    });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.paymentTransition.deleteMany({
      where: {
        payment: {
          orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] },
        },
      },
    });
    await prisma.fulfillmentTransition.deleteMany({
      where: {
        fulfillment: {
          orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] },
        },
      },
    });
    await prisma.orderTransition.deleteMany({
      where: { orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.payment.deleteMany({
      where: { orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.fulfillment.deleteMany({
      where: { orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.order.deleteMany({
      where: { id: { in: [ownerOrderId, olderOrderId, otherOrderId] } },
    });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({
      where: { id: { in: [ownerCustomerId, otherCustomerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerUserId, otherUserId, staffUserId] } },
    });
    await prisma.$disconnect();
  });

  it('lists only the authenticated customer orders with stable pagination', async () => {
    const firstPage = await service.listCustomerOrders(ownerUserId, {
      page: 1,
      perPage: 1,
      sortDir: 'desc',
    });
    expect(firstPage.data.meta).toEqual({
      page: 1,
      perPage: 1,
      total: 2,
      pages: 2,
    });
    expect(firstPage.data.items).toHaveLength(1);
    expect(firstPage.data.items[0]).toMatchObject({
      id: ownerOrderId,
      status: 'PENDING_PAYMENT',
      payment: { latestStatus: 'FAILED', attemptCount: 1 },
      fulfillmentStatus: 'PROCESSING',
      itemCount: 1,
      totals: { total: { amount: '400000', currency: 'IRR' } },
    });
    expect(firstPage.data.items.map((order) => order.id)).not.toContain(
      otherOrderId,
    );

    const secondPage = await service.listCustomerOrders(ownerUserId, {
      page: 2,
      perPage: 1,
      sortDir: 'desc',
    });
    expect(secondPage.data.items.map((order) => order.id)).toEqual([
      olderOrderId,
    ]);
  });

  it('returns indistinguishable not-found failures for absent and foreign orders', async () => {
    const capture = async (id: string) => {
      try {
        await service.getCustomerOrder(ownerUserId, id);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        return (error as NotFoundException).getResponse();
      }
      throw new Error('Expected an ownership-safe not found failure.');
    };

    const foreign = await capture(otherOrderId);
    const absent = await capture(`missing-order-${runId}`);
    expect(foreign).toEqual(absent);
    expect(foreign).toEqual({ code: 'NOT_FOUND', message: 'Order not found.' });
  });

  it('returns customer-safe immutable snapshots without internal payment or actor data', async () => {
    const response = await service.getCustomerOrder(ownerUserId, ownerOrderId);
    const order = response.data.order;
    expect(order.address).toEqual({
      provinceCode: 'TEH',
      city: 'تهران',
      address: 'خیابان جمهوری، پلاک ۲۴',
      postalCode: '1234567890',
      recipient: 'مریم احمدی',
      mobile: '+989121234567',
    });
    expect(order.items[0]).toMatchObject({
      sku: `ORD-READ-${runId}`,
      productTitle: 'لولا آرام‌بند کابینت',
      variantTitle: 'نقره‌ای',
      quantity: 2,
      unitPrice: { amount: '175000', currency: 'IRR' },
    });
    expect(order.timeline.map((event) => event.domain)).toEqual([
      'ORDER',
      'PAYMENT',
      'FULFILLMENT',
    ]);
    expect(JSON.stringify(order)).not.toContain(
      'sensitive-authority-not-public',
    );
    expect(JSON.stringify(order)).not.toContain('requestId');
    expect(JSON.stringify(order)).not.toContain('reason');
    expect(order).not.toHaveProperty('customer');
    expect(order).not.toHaveProperty('audit');
  });

  it('filters and searches the staff queue without flattening lifecycle states', async () => {
    const response = await service.listAdminOrders({
      page: 1,
      perPage: 25,
      sortDir: 'desc',
      sortBy: 'createdAt',
      search: `ORD-${runId}-002`,
      status: 'PENDING_PAYMENT',
      paymentStatus: 'FAILED',
      fulfillmentStatus: 'PROCESSING',
    });
    expect(response.data.meta.total).toBe(1);
    expect(response.data.items[0]).toMatchObject({
      id: ownerOrderId,
      status: 'PENDING_PAYMENT',
      payment: { latestStatus: 'FAILED', attemptCount: 1 },
      fulfillmentStatus: 'PROCESSING',
      customer: {
        id: ownerCustomerId,
        displayNameMasked: 'م***',
      },
    });

    const piiSearch = await service.listAdminOrders({
      page: 1,
      perPage: 25,
      sortDir: 'desc',
      sortBy: 'createdAt',
      search: testMobile(runId, 3),
    });
    expect(piiSearch.data.meta.total).toBe(0);
  });

  it('rejects an inverted staff date window', async () => {
    await expect(
      service.listAdminOrders({
        page: 1,
        perPage: 25,
        sortDir: 'desc',
        sortBy: 'createdAt',
        createdFrom: '2026-09-19T00:00:00.000Z',
        createdTo: '2026-09-18T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('exposes a typed staff timeline and safe audit projection only', async () => {
    const response = await service.getAdminOrder(ownerOrderId);
    const order = response.data.order;
    expect(order.customer).toMatchObject({
      id: ownerCustomerId,
      displayNameMasked: 'م***',
    });
    expect(order.customer.mobileMasked).not.toBe(testMobile(runId, 3));
    expect(order.address).toMatchObject({
      provinceCode: 'TEH',
      city: 'تهران',
      addressMasked: 'خ***',
      postalCodeMasked: '123*****90',
      recipientMasked: 'م***',
      mobileMasked: '+9891*****567',
    });
    expect(order.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'PAYMENT',
          reason: 'Provider verification failed',
          actor: { id: staffUserId, displayNameMasked: 'ا***' },
          requestId: `order-read-payment-request-${runId}`,
        }),
      ]),
    );
    expect(order.audit).toEqual([
      {
        action: 'order.read.integration-evidence',
        actor: { id: staffUserId, displayNameMasked: 'ا***' },
        requestId: `order-read-audit-request-${runId}`,
        createdAt: '2026-09-18T07:01:50.000Z',
      },
    ]);
    const serialized = JSON.stringify(order);
    expect(serialized).not.toContain('must-not-leave-persistence');
    expect(serialized).not.toContain('sensitive-authority-not-public');
    expect(serialized).not.toContain('sensitive-reference-not-public');
    expect(serialized).not.toContain('خیابان جمهوری');
    expect(serialized).not.toContain('مریم احمدی');
    expect(serialized).not.toContain('+989121234567');
    expect(order.truncation).toEqual({
      items: false,
      payments: false,
      timeline: false,
      audit: false,
    });
  });

  async function createOrder(input: {
    id: string;
    customerId: string;
    number: string;
    createdAt: Date;
    status: 'DRAFT' | 'PENDING_PAYMENT' | 'PAID';
    total: bigint;
    quantity?: number;
  }) {
    const quantity = input.quantity ?? 1;
    await prisma.order.create({
      data: {
        id: input.id,
        customerId: input.customerId,
        number: input.number,
        status: input.status,
        subtotal: 175000n * BigInt(quantity),
        discount: 0n,
        shipping: input.total - 175000n * BigInt(quantity),
        grandTotal: input.total,
        addressSnapshot: {
          provinceCode: 'TEH',
          city: 'تهران',
          address: 'خیابان جمهوری، پلاک ۲۴',
          postalCode: '1234567890',
          recipient: 'مریم احمدی',
          mobile: '+989121234567',
        },
        shippingMethod: 'standard-tehran',
        shippingMethodTitle: 'ارسال استاندارد تهران',
        shippingPolicyRevision: 'shipping-policy-2026-09',
        pricePolicyRevision: 'price-policy-2026-09',
        reservationExpiresAt: new Date(input.createdAt.getTime() + 15 * 60_000),
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        items: {
          create: {
            variantId,
            sku: `ORD-READ-${runId}`,
            title: 'لولا آرام‌بند کابینت — نقره‌ای',
            productTitle: 'لولا آرام‌بند کابینت',
            variantTitle: 'نقره‌ای',
            ordinal: 0,
            quantity,
            unitPrice: 175000n,
            total: 175000n * BigInt(quantity),
          },
        },
      },
    });
  }
});

function testMobile(seed: string, offset: number): string {
  const digits = seed.replace(/\D/gu, '').padEnd(8, '0').slice(0, 8);
  return `+989${digits}${offset}`;
}
