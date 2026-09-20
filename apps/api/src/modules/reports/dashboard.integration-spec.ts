import { randomUUID } from 'node:crypto';
import type { DashboardStatusCount } from '@iranyaragh/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import {
  RESERVATION_STATUS_VALUES,
  TRANSFER_STATUS_VALUES,
} from './dashboard.dto';
import { DashboardService } from './dashboard.service';

describe.sequential('DashboardService database integration', () => {
  const prisma = new PrismaService();
  const dashboard = new DashboardService(prisma);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;
  });

  afterAll(async () => {
    if (connected) await prisma.$disconnect();
  });

  it('aggregates exact range boundaries and every inventory lifecycle status', async () => {
    const ids = buildIds();
    const query = {
      createdFrom: '2040-01-01T00:00:00.000Z',
      createdToExclusive: '2040-01-08T00:00:00.000Z',
    };
    const from = new Date(query.createdFrom);
    const to = new Date(query.createdToExclusive);
    const before = (await dashboard.getSummary(query)).data.summary;

    try {
      await seedExactFacts(ids, from, to);
      const response = await dashboard.getSummary(query);
      const summary = response.data.summary;

      expect(summary.presentationTimezone).toBe('Asia/Tehran');
      expect(summary.range).toEqual(query);
      expect(
        summary.rangeMetrics.ordersCreated - before.rangeMetrics.ordersCreated,
      ).toBe(2);
      expect(
        BigInt(summary.rangeMetrics.grossOrderValue.amount) -
          BigInt(before.rangeMetrics.grossOrderValue.amount),
      ).toBe(300n);
      expect(summary.rangeMetrics.grossOrderValue.currency).toBe('IRR');

      expectStatusDelta(
        before.commerceSnapshot.ordersByStatus,
        summary.commerceSnapshot.ordersByStatus,
        { DRAFT: 1, PENDING_PAYMENT: 1, PAID: 1, CANCELLED: 1 },
      );
      expectStatusDelta(
        before.commerceSnapshot.paymentAttemptsByStatus,
        summary.commerceSnapshot.paymentAttemptsByStatus,
        { PAID: 1, FAILED: 1 },
      );
      expectStatusDelta(
        before.commerceSnapshot.fulfillmentsByStatus,
        summary.commerceSnapshot.fulfillmentsByStatus,
        { PROCESSING: 1 },
      );
      expect(
        summary.commerceSnapshot.ordersWithoutPaymentAttempts -
          before.commerceSnapshot.ordersWithoutPaymentAttempts,
      ).toBe(3);
      expect(
        summary.commerceSnapshot.ordersWithoutFulfillment -
          before.commerceSnapshot.ordersWithoutFulfillment,
      ).toBe(3);

      expect(
        summary.inventorySnapshot.zeroAvailableBalances -
          before.inventorySnapshot.zeroAvailableBalances,
      ).toBe(1);
      expect(
        summary.inventorySnapshot.activeReservations -
          before.inventorySnapshot.activeReservations,
      ).toBe(1);
      expectStatusDelta(
        before.inventorySnapshot.reservationsByStatus,
        summary.inventorySnapshot.reservationsByStatus,
        Object.fromEntries(
          RESERVATION_STATUS_VALUES.map((status) => [status, 1]),
        ),
      );
      expectStatusDelta(
        before.inventorySnapshot.transfersByStatus,
        summary.inventorySnapshot.transfersByStatus,
        Object.fromEntries(
          TRANSFER_STATUS_VALUES.map((status) => [status, 1]),
        ),
      );

      const serialized = JSON.stringify(response).toLowerCase();
      for (const forbidden of [
        'mobile',
        'email',
        'address',
        'authority',
        'idempotencykey',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    } finally {
      await cleanup(ids);
    }
  });

  it('has leading indexes for all dashboard range, equality and grouping scans', async () => {
    const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'Order_createdAt_idx',
          'Order_status_createdAt_idx',
          'Payment_status_idx',
          'Payment_orderId_status_idx',
          'Fulfillment_status_updatedAt_idx',
          'Fulfillment_orderId_key',
          'InventoryBalance_available_idx',
          'StockReservation_status_idx',
          'StockTransfer_status_idx'
        )
    `;

    expect(new Set(rows.map(({ indexname }) => indexname))).toEqual(
      new Set([
        'Order_createdAt_idx',
        'Order_status_createdAt_idx',
        'Payment_status_idx',
        'Payment_orderId_status_idx',
        'Fulfillment_status_updatedAt_idx',
        'Fulfillment_orderId_key',
        'InventoryBalance_available_idx',
        'StockReservation_status_idx',
        'StockTransfer_status_idx',
      ]),
    );
  });

  function buildIds() {
    const suffix = randomUUID().replaceAll('-', '');
    return {
      suffix,
      customer: `dashboard_customer_${suffix}`,
      product: `dashboard_product_${suffix}`,
      variant: `dashboard_variant_${suffix}`,
      sourceWarehouse: `dashboard_warehouse_source_${suffix}`,
      targetWarehouse: `dashboard_warehouse_target_${suffix}`,
      sourceLocation: `dashboard_location_source_${suffix}`,
      targetLocation: `dashboard_location_target_${suffix}`,
      orders: ['from', 'inside', 'to', 'before'].map(
        (part) => `dashboard_order_${part}_${suffix}`,
      ),
      payments: ['paid', 'failed'].map(
        (part) => `dashboard_payment_${part}_${suffix}`,
      ),
      fulfillment: `dashboard_fulfillment_${suffix}`,
      balances: ['zero', 'positive'].map(
        (part) => `dashboard_balance_${part}_${suffix}`,
      ),
      reservations: RESERVATION_STATUS_VALUES.map(
        (status) => `dashboard_reservation_${status}_${suffix}`,
      ),
      transfers: TRANSFER_STATUS_VALUES.map(
        (status) => `dashboard_transfer_${status}_${suffix}`,
      ),
    };
  }

  async function seedExactFacts(
    ids: ReturnType<typeof buildIds>,
    from: Date,
    to: Date,
  ) {
    await prisma.customer.create({
      data: {
        id: ids.customer,
        mobile: `+989${String(Date.now()).slice(-9)}`,
        firstName: 'آزمون',
        lastName: 'داشبورد',
      },
    });
    await prisma.product.create({
      data: {
        id: ids.product,
        name: 'کالای آزمون داشبورد',
        slug: `dashboard-${ids.suffix}`,
      },
    });
    await prisma.productVariant.create({
      data: {
        id: ids.variant,
        productId: ids.product,
        sku: `DASH-${ids.suffix}`,
        skuKey: `dash-${ids.suffix}`,
        combinationSignature: 'dashboard-default',
        costPrice: 50n,
        salePrice: 100n,
      },
    });
    await prisma.warehouse.createMany({
      data: [
        {
          id: ids.sourceWarehouse,
          code: `DASH-S-${ids.suffix}`,
          name: 'انبار مبدأ آزمون',
        },
        {
          id: ids.targetWarehouse,
          code: `DASH-T-${ids.suffix}`,
          name: 'انبار مقصد آزمون',
        },
      ],
    });
    await prisma.warehouseLocation.createMany({
      data: [
        {
          id: ids.sourceLocation,
          warehouseId: ids.sourceWarehouse,
          code: 'SOURCE',
        },
        {
          id: ids.targetLocation,
          warehouseId: ids.targetWarehouse,
          code: 'TARGET',
        },
      ],
    });
    await prisma.inventoryBalance.createMany({
      data: [
        {
          id: ids.balances[0]!,
          warehouseId: ids.sourceWarehouse,
          locationId: ids.sourceLocation,
          variantId: ids.variant,
          onHand: 0,
          available: 0,
        },
        {
          id: ids.balances[1]!,
          warehouseId: ids.targetWarehouse,
          locationId: ids.targetLocation,
          variantId: ids.variant,
          onHand: 5,
          available: 5,
        },
      ],
    });
    await prisma.stockReservation.createMany({
      data: RESERVATION_STATUS_VALUES.map((status, index) => ({
        id: ids.reservations[index]!,
        warehouseId: ids.sourceWarehouse,
        locationId: ids.sourceLocation,
        variantId: ids.variant,
        quantity: 1,
        status,
        expiresAt: new Date('2040-02-01T00:00:00.000Z'),
        idempotencyKey: `dashboard-reservation-${status}-${ids.suffix}`,
      })),
    });
    await prisma.stockTransfer.createMany({
      data: TRANSFER_STATUS_VALUES.map((status, index) => ({
        id: ids.transfers[index]!,
        code: `DASH-${status}-${ids.suffix}`,
        sourceWarehouseId: ids.sourceWarehouse,
        targetWarehouseId: ids.targetWarehouse,
        status,
        idempotencyKey: `dashboard-transfer-${status}-${ids.suffix}`,
      })),
    });

    const orderFacts = [
      {
        id: ids.orders[0]!,
        number: `DASH-FROM-${ids.suffix}`,
        status: 'DRAFT' as const,
        total: 100n,
        createdAt: from,
      },
      {
        id: ids.orders[1]!,
        number: `DASH-IN-${ids.suffix}`,
        status: 'PAID' as const,
        total: 200n,
        createdAt: new Date(to.getTime() - 1),
      },
      {
        id: ids.orders[2]!,
        number: `DASH-TO-${ids.suffix}`,
        status: 'CANCELLED' as const,
        total: 400n,
        createdAt: to,
      },
      {
        id: ids.orders[3]!,
        number: `DASH-BEFORE-${ids.suffix}`,
        status: 'PENDING_PAYMENT' as const,
        total: 800n,
        createdAt: new Date(from.getTime() - 1),
      },
    ];
    for (const fact of orderFacts) {
      await prisma.order.create({
        data: {
          id: fact.id,
          number: fact.number,
          customerId: ids.customer,
          status: fact.status,
          subtotal: fact.total,
          grandTotal: fact.total,
          addressSnapshot: { testFixture: true },
          shippingMethod: 'dashboard-test',
          shippingMethodTitle: 'ارسال آزمون',
          shippingPolicyRevision: 'dashboard-test-v1',
          pricePolicyRevision: 'dashboard-test-v1',
          reservationExpiresAt: new Date(fact.createdAt.getTime() + 60_000),
          createdAt: fact.createdAt,
          updatedAt: fact.createdAt,
        },
      });
    }
    await prisma.payment.createMany({
      data: [
        {
          id: ids.payments[0]!,
          orderId: ids.orders[1]!,
          provider: 'dashboard-test',
          amount: 200n,
          status: 'PAID',
          idempotencyKey: `dashboard-payment-paid-${ids.suffix}`,
        },
        {
          id: ids.payments[1]!,
          orderId: ids.orders[1]!,
          provider: 'dashboard-test',
          amount: 200n,
          status: 'FAILED',
          idempotencyKey: `dashboard-payment-failed-${ids.suffix}`,
        },
      ],
    });
    await prisma.fulfillment.create({
      data: {
        id: ids.fulfillment,
        orderId: ids.orders[1]!,
        status: 'PROCESSING',
      },
    });
  }

  async function cleanup(ids: ReturnType<typeof buildIds>) {
    await prisma.fulfillment.deleteMany({ where: { id: ids.fulfillment } });
    await prisma.payment.deleteMany({ where: { id: { in: ids.payments } } });
    await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
    await prisma.stockReservation.deleteMany({
      where: { id: { in: ids.reservations } },
    });
    await prisma.stockTransfer.deleteMany({
      where: { id: { in: ids.transfers } },
    });
    await prisma.inventoryBalance.deleteMany({
      where: { id: { in: ids.balances } },
    });
    await prisma.warehouseLocation.deleteMany({
      where: { id: { in: [ids.sourceLocation, ids.targetLocation] } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: [ids.sourceWarehouse, ids.targetWarehouse] } },
    });
    await prisma.productVariant.deleteMany({ where: { id: ids.variant } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
  }
});

function expectStatusDelta<TStatus extends string>(
  before: DashboardStatusCount<TStatus>[],
  after: DashboardStatusCount<TStatus>[],
  expectedDelta: Partial<Record<TStatus, number>>,
) {
  const beforeCounts = new Map(
    before.map(({ status, count }) => [status, count]),
  );
  const afterCounts = new Map(
    after.map(({ status, count }) => [status, count]),
  );
  for (const [status, delta] of Object.entries(expectedDelta) as Array<
    [TStatus, number]
  >) {
    expect((afterCounts.get(status) ?? 0) - (beforeCounts.get(status) ?? 0)).toBe(
      delta,
    );
  }
}
