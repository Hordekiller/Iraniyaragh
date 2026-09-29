import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { ShipmentReadService } from './shipment-read.service';
import { AdminShipmentListQueryDto } from './shipment-read.dto';
import { STAFF_DELIVERY_PROOF_PREFIX } from './shipment-command-utils';

describe.sequential('ShipmentReadService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const prisma = new PrismaService();
  const service = new ShipmentReadService(prisma);

  const userId = `shipment_read_user_${runId}`;
  const staffId = `shipment_read_staff_${runId}`;
  const customerId = `shipment_read_customer_${runId}`;
  const productId = `shipment_read_product_${runId}`;
  const variantId = `shipment_read_variant_${runId}`;
  const orderId = `shipment_read_order_${runId}`;
  const fulfillmentId = `shipment_read_fulfillment_${runId}`;
  const shipmentId = `shipment_read_shipment_${runId}`;
  const itemId = `shipment_read_item_${runId}`;
  const secondShipmentId = `shipment_read_shipment2_${runId}`;
  const secondOrderId = `shipment_read_order2_${runId}`;
  const secondFulfillmentId = `shipment_read_fulfillment2_${runId}`;
  const dispatchTransitionId = `shipment_read_tr1_${runId}`;
  const deliveryTransitionId = `shipment_read_tr2_${runId}`;

  const query = (over: object = {}) =>
    Object.assign(new AdminShipmentListQueryDto(), over);

  const customerMobile = testMobile(runId, 1);

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        {
          id: userId,
          mobile: customerMobile,
          firstName: 'مریم',
          lastName: 'احمدی',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 120_000),
          isMobileVerified: true,
          mobileVerifiedAt: new Date(),
        },
        {
          id: staffId,
          email: `shipment-read-${runId}@example.test`,
          firstName: 'اپراتور',
          lastName: 'ارسال',
          status: 'ACTIVE',
          createdAt: new Date(Date.now() - 120_000),
          isEmailVerified: true,
          emailVerifiedAt: new Date(),
        },
      ],
    });
    await prisma.customer.create({
      data: { id: customerId, userId, mobile: customerMobile, firstName: 'مریم', lastName: 'احمدی' },
    });
    await prisma.product.create({
      data: { id: productId, name: 'متر لیزری', slug: `shipment-read-product-${runId}`, status: 'ACTIVE' },
    });
    await prisma.productVariant.create({
      data: {
        id: variantId,
        productId,
        sku: `SHIP-READ-${runId}`,
        skuKey: `ship-read-${runId}`,
        combinationSignature: 'shipment-read-default',
        title: 'سبز',
        costPrice: 900000n,
        salePrice: 1250000n,
        status: 'ACTIVE',
      },
    });

    const baseDate = new Date('2026-09-21T08:00:00.000Z');
    await createOrder({
      id: orderId,
      number: `SHP-${runId}-001`,
      createdAt: baseDate,
      status: 'SHIPPED',
      dispatchedAt: new Date(baseDate.getTime() + 3_600_000),
      transitions: [
        {
          id: dispatchTransitionId,
          from: 'READY_TO_SHIP',
          to: 'SHIPPED',
          at: new Date(baseDate.getTime() + 3_600_000),
          actorId: staffId,
        },
        {
          id: deliveryTransitionId,
          from: 'SHIPPED',
          to: 'DELIVERED',
          at: new Date(baseDate.getTime() + 90_000_000),
          reason: `${STAFF_DELIVERY_PROOF_PREFIX}PROOF-${runId}`,
        },
      ],
      carrier: 'post',
      trackingCode: `TRK-${runId}-1`,
      fulfillmentId,
      shipmentId,
      itemId,
      actorId: staffId,
      requestId: `shipment-read-dispatch-${runId}`,
    });
    await createOrder({
      id: secondOrderId,
      number: `SHP-${runId}-002`,
      createdAt: new Date(baseDate.getTime() + 7_200_000),
      status: 'DELIVERED',
      dispatchedAt: new Date(baseDate.getTime() + 9_000_000),
      carrier: 'tipax',
      trackingCode: `TRK-${runId}-2`,
      fulfillmentId: secondFulfillmentId,
      shipmentId: secondShipmentId,
      itemId: `shipment_read_item2_${runId}`,
      actorId: staffId,
      requestId: `shipment-read-dispatch-2-${runId}`,
    });
  });

  afterAll(async () => {
    await prisma.shipmentLine.deleteMany({
      where: { shipment: { id: { in: [shipmentId, secondShipmentId] } } },
    });
    await prisma.shipment.deleteMany({ where: { id: { in: [shipmentId, secondShipmentId] } } });
    await prisma.fulfillmentTransition.deleteMany({
      where: { id: { in: [dispatchTransitionId, deliveryTransitionId] } },
    });
    await prisma.fulfillment.deleteMany({ where: { id: { in: [fulfillmentId, secondFulfillmentId] } } });
    await prisma.order.deleteMany({ where: { id: { in: [orderId, secondOrderId] } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, staffId] } } });
    await prisma.$disconnect();
  });

  async function createOrder(input: {
    id: string;
    number: string;
    createdAt: Date;
    status: 'SHIPPED' | 'DELIVERED';
    dispatchedAt: Date;
    carrier: string;
    trackingCode: string;
    fulfillmentId: string;
    shipmentId: string;
    itemId: string;
    actorId: string;
    requestId: string;
    transitions?: {
      id: string;
      from: 'READY_TO_SHIP' | 'SHIPPED';
      to: 'SHIPPED' | 'DELIVERED';
      at: Date;
      reason?: string;
      actorId?: string;
    }[];
  }) {
    await prisma.order.create({
      data: {
        id: input.id,
        customerId,
        number: input.number,
        status: 'PAID',
        subtotal: 1250000n,
        discount: 0n,
        shipping: 0n,
        grandTotal: 1250000n,
        addressSnapshot: {
          provinceCode: 'THR',
          city: 'تهران',
          address: 'خیابان ولیعصر، پلاک ۱۲',
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
            id: input.itemId,
            variantId,
            sku: `SHIP-READ-${runId}`,
            title: 'متر لیزری — سبز',
            productTitle: 'متر لیزری',
            variantTitle: 'سبز',
            ordinal: 0,
            quantity: 2,
            unitPrice: 1250000n,
            total: 2500000n,
          },
        },
      },
    });
    await prisma.fulfillment.create({
      data: {
        id: input.fulfillmentId,
        orderId: input.id,
        status: input.status,
        createdAt: input.createdAt,
        updatedAt: input.dispatchedAt,
      },
    });
    await prisma.shipment.create({
      data: {
        id: input.shipmentId,
        orderId: input.id,
        fulfillmentId: input.fulfillmentId,
        carrier: input.carrier,
        trackingCode: input.trackingCode,
        addressSnapshot: {
          provinceCode: 'THR',
          city: 'تهران',
          address: 'خیابان ولیعصر، پلاک ۱۲',
          postalCode: '1234567890',
          recipient: 'مریم احمدی',
          mobile: '+989121234567',
        },
        actorId: input.actorId,
        requestId: input.requestId,
        dispatchedAt: input.dispatchedAt,
        lines: { create: { orderItemId: input.itemId, quantity: 2 } },
      },
    });
    for (const transition of input.transitions ?? []) {
      await prisma.fulfillmentTransition.create({
        data: {
          id: transition.id,
          fulfillmentId: input.fulfillmentId,
          from: transition.from,
          to: transition.to,
          reason: transition.reason ?? null,
          actorId: transition.actorId ?? null,
          requestId: `${input.requestId}-${transition.id}`,
          createdAt: transition.at,
        },
      });
    }
  }

  it('lists persisted shipments with masked customer data and real line counts', async () => {
    const result = await service.listShipments(query({ carrier: 'post' }));
    expect(result.data.items).toHaveLength(1);
    const item = result.data.items[0];
    expect(item.id).toBe(shipmentId);
    expect(item.orderId).toBe(orderId);
    expect(item.orderNumber).toBe(`SHP-${runId}-001`);
    expect(item.status).toBe('SHIPPED');
    expect(item.trackingCode).toBe(`TRK-${runId}-1`);
    expect(item.itemCount).toBe(1);
    expect(item.totalQuantity).toBe(2);
    expect(item.city).toBe('تهران');
    expect(item.customer.displayNameMasked).toBe('م***');
    expect(item.customer.mobileMasked).toBe(maskIdentifier(customerMobile, 5, 3));
  });

  it('filters by status, tracking code and dispatch range', async () => {
    const byStatus = await service.listShipments(query({ status: 'DELIVERED' }));
    expect(byStatus.data.items.map((row) => row.id)).toEqual([secondShipmentId]);

    const byTracking = await service.listShipments(query({ trackingCode: `TRK-${runId}-1` }));
    expect(byTracking.data.items.map((row) => row.id)).toEqual([shipmentId]);

    const future = new Date(Date.now() + 86_400_000).toISOString();
    const outOfRange = await service.listShipments(query({ dispatchedTo: future, status: 'SHIPPED', carrier: 'nothing' }));
    expect(outOfRange.data.items).toHaveLength(0);
  });

  it('paginates with stable ordering and reports the real total', async () => {
    const page = await service.listShipments(
      query({ sortBy: 'orderNumber', sortDir: 'asc', page: 1, perPage: 1 }),
    );
    expect(page.data.meta).toEqual({ page: 1, perPage: 1, total: 2, pages: 2 });
    expect(page.data.items[0].orderNumber).toBe(`SHP-${runId}-001`);

    const second = await service.listShipments(
      query({ sortBy: 'orderNumber', sortDir: 'asc', page: 2, perPage: 1 }),
    );
    expect(second.data.items[0].orderNumber).toBe(`SHP-${runId}-002`);
  });

  it('returns the detail with masked address, dispatcher and line items', async () => {
    const result = await service.getShipment(shipmentId);
    const shipment = result.data.shipment;
    expect(shipment.address).toEqual({
      provinceCode: 'THR',
      city: 'تهران',
      addressMasked: 'خ***',
      postalCodeMasked: '123*****90',
      recipientMasked: 'م***',
      mobileMasked: maskIdentifier('+989121234567', 5, 3),
    });
    expect(shipment.dispatchedBy).toEqual({ id: staffId, displayNameMasked: 'ا***' });
    expect(shipment.lines).toEqual([
      {
        orderItemId: itemId,
        sku: `SHIP-READ-${runId}`,
        productTitle: 'متر لیزری',
        variantTitle: 'سبز',
        quantity: 2,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('خیابان ولیعصر، پلاک ۱۲');
  });

  it('rebuilds the timeline from persisted transitions with the delivery proof', async () => {
    const result = await service.getShipment(shipmentId);
    const { timeline } = result.data.shipment;

    expect(timeline.map((event) => event.kind)).toEqual(['DISPATCH', 'DELIVERY_PROOF']);
    expect(timeline[0]).toEqual({
      id: dispatchTransitionId,
      from: 'READY_TO_SHIP',
      to: 'SHIPPED',
      kind: 'DISPATCH',
      proofReference: null,
      actor: { id: staffId, displayNameMasked: 'ا***' },
      requestId: `shipment-read-dispatch-${runId}-${dispatchTransitionId}`,
      createdAt: new Date(new Date('2026-09-21T08:00:00.000Z').getTime() + 3_600_000).toISOString(),
    });
    expect(timeline[1]).toEqual({
      id: deliveryTransitionId,
      from: 'SHIPPED',
      to: 'DELIVERED',
      kind: 'DELIVERY_PROOF',
      proofReference: `PROOF-${runId}`,
      actor: null,
      requestId: `shipment-read-dispatch-${runId}-${deliveryTransitionId}`,
      createdAt: new Date(new Date('2026-09-21T08:00:00.000Z').getTime() + 90_000_000).toISOString(),
    });
  });

  it('reports no fabricated events for a shipment without transitions', async () => {
    const result = await service.getShipment(secondShipmentId);
    expect(result.data.shipment.timeline).toEqual([]);
  });
});

function testMobile(seed: string, offset: number): string {
  const digits = seed.replace(/\D/gu, '').padEnd(8, '0').slice(0, 8);
  return `+989${digits}${offset}`;
}

function maskIdentifier(value: string, prefix: number, suffix: number): string {
  if (value.length <= prefix + suffix) return '*'.repeat(value.length);
  return `${value.slice(0, prefix)}${'*'.repeat(value.length - prefix - suffix)}${value.slice(-suffix)}`;
}
