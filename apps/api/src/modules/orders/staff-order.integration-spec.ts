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
import { StaffOrderService } from './staff-order.service';
import { OrderReadService } from './order-read.service';
import type { CheckoutAddress, StaffOrderCreateInput } from '@iranyaragh/contracts';

function numericSuffix(value: string, increment: number): string {
  const packed = (BigInt(`0x${value}`) % 10_000_000_000n + BigInt(increment))
    .toString()
    .padStart(10, '0');
  return packed;
}

describe.sequential('StaffOrderService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const staffUser = `stafford_staff_${runId}`;
  const customerId = `stafford_customer_${runId}`;
  const inactiveCustomerId = `stafford_inactive_${runId}`;
  const secondCustomerId = `stafford_second_${runId}`;
  const activeCustomerMobile = `+9890${numericSuffix(runId, 3)}`;
  const productId = `stafford_product_${runId}`;
  const variantAId = `stafford_variant_a_${runId}`;
  const variantBId = `stafford_variant_b_${runId}`;
  const inactiveVariantId = `stafford_variant_off_${runId}`;
  const splitVariantId = `stafford_variant_split_${runId}`;
  const warehouseId = `stafford_warehouse_${runId}`;
  const locationAId = `stafford_location_a_${runId}`;
  const locationBId = `stafford_location_b_${runId}`;
  const secondWarehouseId = `stafford_warehouse2_${runId}`;
  const locationCId = `stafford_location_c_${runId}`;
  const requestIdPrefix = `stafford-${runId}`;

  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const staffOrders = new StaffOrderService(prisma, audit);
  const orderReads = new OrderReadService(prisma);
  let connected = false;

  const address: CheckoutAddress = {
    provinceCode: 'THR',
    city: 'Tehran',
    address: 'Unit 4, Valiasr St',
    postalCode: '1234567890',
    recipient: 'Staff Test',
    mobile: '+989120000000',
  };

  async function seedBalances(): Promise<void> {
    await prisma.inventoryBalance.deleteMany({
      where: {
        variantId: { in: [variantAId, variantBId, inactiveVariantId, splitVariantId] },
      },
    });
    await prisma.inventoryBalance.createMany({
      data: [
        {
          variantId: variantAId,
          warehouseId,
          locationId: locationAId,
          onHand: 50,
          reserved: 0,
          available: 50,
        },
        {
          variantId: splitVariantId,
          warehouseId,
          locationId: locationAId,
          onHand: 2,
          reserved: 0,
          available: 2,
        },
        {
          variantId: splitVariantId,
          warehouseId: secondWarehouseId,
          locationId: locationCId,
          onHand: 10,
          reserved: 0,
          available: 10,
        },
        {
          variantId: variantBId,
          warehouseId,
          locationId: locationBId,
          onHand: 3,
          reserved: 0,
          available: 3,
        },
        {
          variantId: inactiveVariantId,
          warehouseId,
          locationId: locationAId,
          onHand: 10,
          reserved: 0,
          available: 10,
        },
      ],
    });
  }

  async function resetState(): Promise<void> {
    await prisma.stockReservation.deleteMany({ where: { order: { customerId: { in: [customerId, inactiveCustomerId, secondCustomerId] } } } });
    await prisma.orderItem.deleteMany({ where: { order: { customerId: { in: [customerId, inactiveCustomerId, secondCustomerId] } } } });
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: 'order', aggregateId: { in: await orderIds() } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: await orderIds() } } });
    await prisma.checkoutIdempotencyRecord.deleteMany({ where: { customerId: { in: [customerId, inactiveCustomerId, secondCustomerId] } } });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { orderId: { in: await orderIds() } } });
    await prisma.order.deleteMany({ where: { customerId: { in: [customerId, inactiveCustomerId, secondCustomerId] } } });
  }

  async function orderIds(): Promise<string[]> {
    const rows = await prisma.order.findMany({
      where: { customerId: { in: [customerId, inactiveCustomerId] } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    await prisma.user.create({
      data: {
        id: staffUser,
        email: `stafford-${runId}@example.test`,
        status: 'ACTIVE',
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.customer.createMany({
      data: [
        { id: customerId, mobile: activeCustomerMobile, firstName: 'Counter' },
        {
          id: inactiveCustomerId,
          mobile: `+9890${numericSuffix(runId, 4)}`,
          status: 'INACTIVE',
          deactivatedAt: new Date(),
        },
      ],
    });
    await prisma.product.create({
      data: {
        id: productId,
        name: 'Staff order product',
        slug: `stafford-product-${runId}`,
        status: 'ACTIVE',
      },
    });
    await prisma.productVariant.createMany({
      data: [
        {
          id: variantAId,
          productId,
          sku: `STAFFORD-A-${runId}`,
          skuKey: canonicalizeSku(`STAFFORD-A-${runId}`),
          combinationSignature: EMPTY_AXIS_SIGNATURE,
          title: 'Variant A',
          costPrice: 80_000n,
          salePrice: 100_000n,
          status: 'ACTIVE',
          isActive: true,
        },
        {
          id: variantBId,
          productId,
          sku: `STAFFORD-B-${runId}`,
          skuKey: canonicalizeSku(`STAFFORD-B-${runId}`),
          combinationSignature: combinationSignature([
            { attributeId: 'stafford-axis', optionId: 'stafford-option-b' },
          ]),
          title: 'Variant B',
          costPrice: 160_000n,
          salePrice: 200_000n,
          status: 'ACTIVE',
          isActive: true,
        },
        {
          id: splitVariantId,
          productId,
          sku: `STAFFORD-SPLIT-${runId}`,
          skuKey: canonicalizeSku(`STAFFORD-SPLIT-${runId}`),
          combinationSignature: combinationSignature([
            { attributeId: 'stafford-axis', optionId: 'stafford-option-split' },
          ]),
          title: 'Variant Split',
          costPrice: 90_000n,
          salePrice: 120_000n,
          status: 'ACTIVE',
          isActive: true,
        },
        {
          id: inactiveVariantId,
          productId,
          sku: `STAFFORD-OFF-${runId}`,
          skuKey: canonicalizeSku(`STAFFORD-OFF-${runId}`),
          combinationSignature: combinationSignature([
            { attributeId: 'stafford-axis', optionId: 'stafford-option-off' },
          ]),
          title: 'Retired variant',
          costPrice: 10_000n,
          salePrice: 20_000n,
          status: 'ARCHIVED',
          isActive: false,
        },
      ],
    });
    await prisma.warehouse.create({
      data: { id: warehouseId, code: `STAFFORD-WH-${runId}`, name: 'Staff order warehouse' },
    });
    await prisma.warehouse.create({
      data: {
        id: secondWarehouseId,
        code: `STAFFORD-WH2-${runId}`,
        name: 'Staff order overflow warehouse',
      },
    });
    await prisma.warehouseLocation.createMany({
      data: [
        { id: locationAId, warehouseId, code: 'A-01', name: 'A' },
        { id: locationBId, warehouseId, code: 'B-01', name: 'B' },
        { id: locationCId, warehouseId: secondWarehouseId, code: 'C-01', name: 'C' },
      ],
    });
    await seedBalances();
  });

  beforeEach(async () => {
    await resetState();
    await seedBalances();
  });

  afterAll(async () => {
    if (!connected) return;
    await resetState();
    await prisma.inventoryBalance.deleteMany({
      where: {
        variantId: { in: [variantAId, variantBId, inactiveVariantId, splitVariantId] },
      },
    });
    await prisma.warehouseLocation.deleteMany({
      where: { warehouseId: { in: [warehouseId, secondWarehouseId] } },
    });
    await prisma.warehouse.deleteMany({
      where: { id: { in: [warehouseId, secondWarehouseId] } },
    });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerId, inactiveCustomerId, secondCustomerId] } },
    });
    await prisma.staffOrderCommandRecord.deleteMany({ where: { actorId: staffUser } });
    await prisma.user.deleteMany({ where: { id: staffUser } });
    await prisma.$disconnect();
  });

  it('creates a reserved pending-payment order priced from the catalog', async () => {
    const key = `create-${runId}`;
    const requestId = `${requestIdPrefix}-create`;

    const result = await staffOrders.create({
      actorId: staffUser,
      requestId,
      idempotencyKey: key,
      payload: {
        customerId,
        lines: [
          { variantId: variantAId, quantity: 2 },
          { variantId: variantBId, quantity: 1 },
        ],
        address,
      },
    });

    expect(result.data.replayed).toBe(false);
    expect(result.data.order.status).toBe('PENDING_PAYMENT');
    expect(result.data.order.customer.id).toBe(customerId);
    expect(result.data.order.totals).toEqual({
      subtotal: { amount: '400000', currency: 'IRR' },
      discount: { amount: '0', currency: 'IRR' },
      shipping: { amount: '0', currency: 'IRR' },
      total: { amount: '400000', currency: 'IRR' },
    });
    expect(result.data.reservations).toHaveLength(2);

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: result.data.order.id },
      include: { items: true, reservations: true, transitions: true },
    });
    // 2 x 100000 + 1 x 200000, never a client-supplied total.
    expect(persisted.subtotal).toBe(400_000n);
    expect(persisted.grandTotal).toBe(400_000n);
    expect(persisted.shipping).toBe(0n);
    expect(persisted.discount).toBe(0n);
    expect(persisted.shippingMethod).toBe('PICKUP');
    expect(persisted.pricePolicyRevision).toBe('catalog-sale-price-v1');
    expect(persisted.items).toHaveLength(2);
    expect(persisted.reservations).toHaveLength(2);

    // Real state-machine transition, not a direct status write.
    expect(persisted.transitions).toContainEqual(
      expect.objectContaining({
        from: 'DRAFT',
        to: 'PENDING_PAYMENT',
        reason: 'STAFF_ORDER_CREATED',
        actorId: staffUser,
        requestId,
      }),
    );

    // Inventory moved available -> reserved, never a direct stock write.
    const balance = await prisma.inventoryBalance.findFirstOrThrow({
      where: { variantId: variantAId },
    });
    expect(balance.available).toBe(48);
    expect(balance.reserved).toBe(2);
    expect(balance.onHand).toBe(50);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'order.staff.created', entityId: result.data.order.id },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorId).toBe(staffUser);

    const outbox = await prisma.outboxEvent.findFirst({
      where: { deduplicationKey: `order-created:${result.data.order.id}` },
    });
    expect(outbox?.topic).toBe('ORDER_CREATED');
  });

  it('replays the stored response for a repeated idempotency key', async () => {
    const key = `replay-${runId}`;
    const payload = {
      customerId,
      lines: [{ variantId: variantAId, quantity: 1 }],
      address,
    };

    const first = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-replay-1`,
      idempotencyKey: key,
      payload,
    });
    const second = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-replay-2`,
      idempotencyKey: key,
      payload,
    });

    expect(second.data.order.id).toBe(first.data.order.id);
    // A blind retry must never reserve the stock twice.
    expect(await prisma.order.count({ where: { customerId } })).toBe(1);
    const balance = await prisma.inventoryBalance.findFirstOrThrow({
      where: { variantId: variantAId },
    });
    expect(balance.reserved).toBe(1);
  });

  it('rejects a reused key whose payload changed', async () => {
    const key = `conflict-${runId}`;
    await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-conflict-1`,
      idempotencyKey: key,
      payload: { customerId, lines: [{ variantId: variantAId, quantity: 1 }], address },
    });

    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-conflict-2`,
        idempotencyKey: key,
        payload: { customerId, lines: [{ variantId: variantAId, quantity: 2 }], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('prices the order on the server and never from a client amount', async () => {
    const result = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-server-price`,
      idempotencyKey: `server-price-${runId}`,
      payload: {
        customerId,
        lines: [{ variantId: variantAId, quantity: 2 }],
        address,
        // A staff form must not be able to move money, so a client-supplied
        // amount is ignored rather than honoured.
        discount: { amount: '999999', currency: 'IRR' },
      } as StaffOrderCreateInput,
    });

    expect(result.data.order.totals.discount).toEqual({
      amount: '0',
      currency: 'IRR',
    });
    expect(result.data.order.totals.total).toEqual({
      amount: '200000',
      currency: 'IRR',
    });
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: result.data.order.id },
    });
    expect(persisted.discount).toBe(0n);
    expect(persisted.grandTotal).toBe(persisted.subtotal);
  });

  it('exposes a concurrency token and stores the staff note', async () => {
    const result = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-note`,
      idempotencyKey: `note-${runId}`,
      payload: {
        customerId,
        lines: [{ variantId: variantAId, quantity: 1 }],
        address,
        note: 'تحویل حضوری، تماس بعد از ساعت ۵',
      },
    });

    expect(result.data.order.version).toBe(0);
    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: result.data.order.id },
    });
    expect(persisted.staffNote).toBe('تحویل حضوری، تماس بعد از ساعت ۵');
    expect(persisted.version).toBe(0);
  });

  it('rejects a guest submission with an explicit unsupported code', async () => {
    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-guest`,
        idempotencyKey: `guest-${runId}`,
        payload: { lines: [{ variantId: variantAId, quantity: 1 }], address },
      }),
    ).rejects.toMatchObject({
      status: 422,
      response: { code: 'GUEST_ORDER_UNSUPPORTED' },
    });
  });

  it('keeps one order per staff member and idempotency key across customers', async () => {
    const key = `cross-customer-${runId}`;
    const secondMobile = `0912${runId.replace(/\D/g, '').slice(0, 7).padStart(7, '0')}`;
    await prisma.customer.create({
      data: {
        id: secondCustomerId,
        firstName: 'Other',
        lastName: 'Buyer',
        mobile: secondMobile,
        status: 'ACTIVE',
      },
    });

    const first = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-cross-1`,
      idempotencyKey: key,
      payload: {
        customerId,
        lines: [{ variantId: variantAId, quantity: 1 }],
        address,
      },
    });

    // Same operator, same key, different customer: the checkout key table is
    // unique per customer, so this must still be refused rather than quietly
    // becoming a second order.
    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-cross-2`,
        idempotencyKey: key,
        payload: {
          customerId: secondCustomerId,
          lines: [{ variantId: variantAId, quantity: 1 }],
          address,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });

    const replay = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-cross-3`,
      idempotencyKey: key,
      payload: {
        customerId,
        lines: [{ variantId: variantAId, quantity: 1 }],
        address,
      },
    });
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.order.id).toBe(first.data.order.id);
    expect(
      await prisma.order.count({ where: { customerId: secondCustomerId } }),
    ).toBe(0);
  });

  it('refuses to oversell and leaves no partial reservation', async () => {
    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-stock`,
        idempotencyKey: `stock-${runId}`,
        payload: {
          customerId,
          lines: [
            { variantId: variantAId, quantity: 1 },
            { variantId: variantBId, quantity: 99 },
          ],
          address,
        },
      }),
    ).rejects.toMatchObject({ response: { code: 'INSUFFICIENT_STOCK' } });

    // The whole transaction rolls back, so the first line leaves no trace.
    expect(await prisma.order.count({ where: { customerId } })).toBe(0);
    expect(await prisma.stockReservation.count({ where: { variantId: variantAId } })).toBe(0);
    const balance = await prisma.inventoryBalance.findFirstOrThrow({
      where: { variantId: variantAId },
    });
    expect(balance.available).toBe(50);
  });

  it('splits a line across locations when one cannot cover it', async () => {
    const result = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-split`,
      idempotencyKey: `split-${runId}`,
      payload: {
        customerId,
        lines: [{ variantId: splitVariantId, quantity: 4 }],
        address,
      },
    });

    const reservations = await prisma.stockReservation.findMany({
      where: { orderId: result.data.order.id },
      orderBy: { locationId: 'asc' },
    });
    // Location A holds 2 and the overflow warehouse holds 10, so a line of 4
    // can only be satisfied by drawing from both.
    expect(reservations).toHaveLength(2);
    expect(
      reservations.reduce((sum, row) => sum + row.quantity, 0),
    ).toBe(4);
    const byLocation = new Map(
      reservations.map((row) => [row.locationId, row.quantity]),
    );
    expect(byLocation.get(locationAId)).toBe(2);
    expect(byLocation.get(locationCId)).toBe(2);

    // Both balances are moved by the same ledger rules, never written directly.
    const balances = await prisma.inventoryBalance.findMany({
      where: { variantId: splitVariantId },
    });
    for (const balance of balances) {
      expect(balance.reserved).toBe(byLocation.get(balance.locationId) ?? 0);
      expect(balance.available).toBe(balance.onHand - balance.reserved);
    }
    // Every reservation carries a deterministic key, so a retry cannot
    // create a second reservation for the same location.
    expect(new Set(reservations.map((row) => row.idempotencyKey)).size).toBe(
      reservations.length,
    );
  });

  it('searches customers and variants without widening what staff can see', async () => {
    const customers = await staffOrders.options({ kind: 'customer' });
    const ids = customers.data.items.map((item) => item.id);
    expect(ids).toContain(customerId);
    // An inactive customer cannot receive a new order, so it is not offered.
    expect(ids).not.toContain(inactiveCustomerId);

    const serialized = JSON.stringify(customers);
    expect(serialized).not.toContain(activeCustomerMobile);
    expect(serialized).not.toContain(activeCustomerMobile.replace(/^\+/, ''));
    for (const item of customers.data.items) {
      expect(item.detail).toMatch(/\*+/);
    }

    const byName = await staffOrders.options({ kind: 'customer', search: 'Counter' });
    expect(byName.data.items.map((item) => item.id)).toContain(customerId);

    // Mobile search only widens to the unique index when the needle looks
    // numeric, so the test must use the customer's real digits.
    const byMobileDigits = await staffOrders.options({
      kind: 'customer',
      search: activeCustomerMobile.slice(4, 14),
    });
    expect(byMobileDigits.data.items.map((item) => item.id)).toContain(customerId);

    const variants = await staffOrders.options({ kind: 'variant', search: 'STAFFORD-A' });
    expect(variants.data.items.map((item) => item.id)).toContain(variantAId);
    expect(variants.data.items[0]?.label).toContain('STAFFORD-A');
    // The server prices the order, so the lookup never leaks catalog pricing.
    expect(JSON.stringify(variants)).not.toContain('100000');

    const all = await staffOrders.options({ kind: 'variant' });
    expect(all.data.count).toBeLessThanOrEqual(20);
    expect(all.data.items.map((item) => item.id)).not.toContain(inactiveVariantId);
  });

  it('rejects inactive customers and non-sellable variants', async () => {
    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-inactive-customer`,
        idempotencyKey: `inactive-cust-${runId}`,
        payload: { customerId: inactiveCustomerId, lines: [{ variantId: variantAId, quantity: 1 }], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_INACTIVE' } });

    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-inactive-variant`,
        idempotencyKey: `inactive-variant-${runId}`,
        payload: { customerId, lines: [{ variantId: inactiveVariantId, quantity: 1 }], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'SKU_NOT_SELLABLE' } });

    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-unknown-variant`,
        idempotencyKey: `unknown-variant-${runId}`,
        payload: { customerId, lines: [{ variantId: 'does-not-exist', quantity: 1 }], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'SKU_NOT_FOUND' } });
  });

  it('rejects an unknown customer', async () => {
    await expect(
      staffOrders.create({
        actorId: staffUser,
        requestId: `${requestIdPrefix}-unknown-customer`,
        idempotencyKey: `unknown-cust-${runId}`,
        payload: { customerId: 'nope', lines: [{ variantId: variantAId, quantity: 1 }], address },
      }),
    ).rejects.toMatchObject({ response: { code: 'CUSTOMER_NOT_FOUND' } });
  });

  it('reserves concurrently-created orders without losing stock', async () => {
    const attempts = await Promise.allSettled(
      [1, 2, 3, 4].map((index) =>
        staffOrders.create({
          actorId: staffUser,
          requestId: `${requestIdPrefix}-race-${index}`,
          idempotencyKey: `race-${runId}-${index}`,
          payload: {
            customerId,
            lines: [{ variantId: variantBId, quantity: 1 }],
            address,
          },
        }),
      ),
    );

    // variantB has 3 available, so at most three of the four can win.
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    expect(fulfilled.length).toBeLessThanOrEqual(3);

    const balance = await prisma.inventoryBalance.findFirstOrThrow({
      where: { variantId: variantBId },
    });
    expect(balance.available).toBeGreaterThanOrEqual(0);
    expect(balance.reserved).toBe(3 - balance.available);
  });

  it('exposes the order through the admin read API', async () => {
    const created = await staffOrders.create({
      actorId: staffUser,
      requestId: `${requestIdPrefix}-read`,
      idempotencyKey: `read-${runId}`,
      payload: { customerId, lines: [{ variantId: variantAId, quantity: 1 }], address },
    });

    const detail = await orderReads.getAdminOrder(created.data.order.id);
    expect(detail.data.order.id).toBe(created.data.order.id);
    expect(detail.data.order.customer.id).toBe(customerId);
    expect(detail.data.order.totals.total).toEqual({
      amount: '100000',
      currency: 'IRR',
    });
  });
});
