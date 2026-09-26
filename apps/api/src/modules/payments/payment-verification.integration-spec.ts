import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import {
  EMPTY_AXIS_SIGNATURE,
  canonicalizeSku,
} from '../catalog/variant-identifiers';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrderCommandService } from '../orders/order-command.service';
import type {
  PaymentGatewayConfig,
  PaymentProvider,
  PaymentVerifyRequest,
  PaymentVerifyResult,
} from './payment-provider.port';
import { PaymentVerificationService } from './payment-verification.service';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function numericSuffix(value: string, increment: number): string {
  const packed = (BigInt(`0x${value}`) % 10_000_000_000n + BigInt(increment))
    .toString()
    .padStart(10, '0');
  return packed;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class FakeProvider {
  readonly providerName = 'zarinpal' as const;
  readonly authorize = vi.fn();
  readonly verify = vi.fn(
    async (request: PaymentVerifyRequest): Promise<PaymentVerifyResult> => ({
      status: 'verified' as const,
      referenceId: `REF-${request.correlationId}`,
    }),
  );
}

describe.sequential('PaymentVerificationService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const requestIdPrefix = `payverify-${runId}`;
  const customerUser = `payverify_customer_${runId}`;
  const otherUser = `payverify_other_${runId}`;
  const staffUser = `payverify_staff_${runId}`;
  const customerId = `payverify_customer_id_${runId}`;
  const otherCustomerId = `payverify_other_customer_id_${runId}`;
  const productId = `payverify_product_${runId}`;
  const variantAId = `payverify_variant_a_${runId}`;
  const warehouseId = `payverify_warehouse_${runId}`;
  const locationAId = `payverify_location_a_${runId}`;

  const gatewayConfig: PaymentGatewayConfig = {
    providerName: 'zarinpal',
    mode: 'sandbox',
    callbackUrl: 'http://localhost:4321/api/v1/payments/zarinpal/callback',
    timeoutMs: 100,
  };

  const prisma = new PrismaService();
  const audit = new AuditLogService(prisma);
  const inventory = new InventoryService(prisma, audit);
  const provider = new FakeProvider();
  const verification = new PaymentVerificationService(
    prisma,
    provider as never as PaymentProvider,
    gatewayConfig as never,
    audit,
    inventory,
  );
  const commands = new OrderCommandService(prisma, audit, inventory);
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
        { id: customerUser, email: `payverify-a-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: otherUser, email: `payverify-b-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: staffUser, email: `payverify-c-${runId}@example.test`, status: 'ACTIVE', isEmailVerified: true, emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
      ],
    });
    await prisma.customer.createMany({
      data: [
        { id: customerId, userId: customerUser, mobile: `+9890${numericSuffix(runId, 0)}` },
        { id: otherCustomerId, userId: otherUser, mobile: `+9890${numericSuffix(runId, 1)}` },
      ],
    });
    await prisma.product.create({
      data: { id: productId, name: 'Payverify product', slug: `payverify-product-${runId}`, status: 'ACTIVE' },
    });
    await prisma.productVariant.create({
      data: { id: variantAId, productId, sku: `PAYVERIFY-A-${runId}`, skuKey: canonicalizeSku(`PAYVERIFY-A-${runId}`), combinationSignature: EMPTY_AXIS_SIGNATURE, title: 'Variant A', costPrice: 80000n, salePrice: 100000n, status: 'ACTIVE', isActive: true },
    });
    await prisma.warehouse.create({
      data: { id: warehouseId, code: `PAYVERIFY-WH-${runId}`, name: 'Payverify warehouse' },
    });
    await prisma.warehouseLocation.create({
      data: { id: locationAId, warehouseId, code: 'A-01', name: 'A' },
    });
  });

  beforeEach(async () => {
    await resetState();
    provider.verify.mockReset();
    provider.verify.mockImplementation(
      async (request: PaymentVerifyRequest): Promise<PaymentVerifyResult> => ({
        status: 'verified',
        referenceId: `REF-${request.correlationId}`,
      }),
    );
  });

  afterAll(async () => {
    if (!connected) return;
    await resetState();
    await prisma.inventoryBalance.deleteMany({ where: { variantId: { in: [variantAId] } } });
    await prisma.warehouseLocation.deleteMany({ where: { warehouseId } });
    await prisma.warehouse.deleteMany({ where: { id: warehouseId } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.customer.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customerUser, otherUser, staffUser] } } });
    await prisma.$disconnect();
  });

  it('settles payment, order, inventory and fulfillment atomically on provider proof', async () => {
    const order = await createOrderWithReservation('happy', 2);
    await createPayment(order.id, 'S-happy', 'happy');
    const requestId = `${requestIdPrefix}-happy`;

    const result = await verification.verify({
      authority: 'S-happy',
      status: 'OK',
      requestId,
    });

    expect(result.data.verification).toMatchObject({
      paymentId: expect.any(String),
      status: 'PAID',
      provider: 'zarinpal',
      amount: { amount: '150', currency: 'IRR' },
      authority: 'S-happy',
      referenceId: `REF-${requestId}`,
      outcome: 'VERIFIED',
      orderId: order.id,
      orderStatus: 'PAID',
      consumedReservations: 1,
      fulfillmentId: expect.any(String),
    });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment).toMatchObject({ status: 'PAID', referenceId: `REF-${requestId}` });
    await expect(
      prisma.paymentTransition.findFirstOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({
      from: 'PENDING',
      to: 'PAID',
      reason: 'GATEWAY_VERIFIED',
      requestId,
    });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'PAID' });
    await expect(
      prisma.orderTransition.findFirstOrThrow({ where: { orderId: order.id, to: 'PAID' } }),
    ).resolves.toMatchObject({ from: 'PENDING_PAYMENT', reason: 'PAYMENT_VERIFIED' });

    const reservation = await prisma.stockReservation.findFirstOrThrow({ where: { orderId: order.id } });
    expect(reservation.status).toBe('CONSUMED');
    const balance = await balanceOf();
    expect(balance).toMatchObject({ onHand: 0, reserved: 0, available: 0 });
    const sale = await prisma.inventoryMovement.findFirstOrThrow({
      where: { referenceId: order.id, type: 'SALE' },
    });
    expect(sale).toMatchObject({ quantity: -2, beforeOnHand: 2, afterOnHand: 0 });

    const fulfillment = await prisma.fulfillment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(fulfillment.status).toBe('PENDING');
    await expect(prisma.fulfillmentTransition.findMany({ where: { fulfillmentId: fulfillment.id } }))
      .resolves.toMatchObject([{ from: null, to: 'PENDING', reason: 'PAYMENT_VERIFIED', requestId }]);

    await expect(
      prisma.outboxEvent.findFirstOrThrow({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED' } }),
    ).resolves.toMatchObject({ deduplicationKey: `payment-verified:${payment.id}` });
    await expect(
      prisma.auditLog.count({ where: { requestId, action: 'payment.paid' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { requestId, action: 'order.paid' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { requestId, action: 'inventory.reservation.consumed' } }),
    ).resolves.toBe(1);
  });

  it('replays a duplicated success callback and never double-consumes stock', async () => {
    const order = await createOrderWithReservation('dupe', 2);
    await createPayment(order.id, 'S-dupe', 'dupe');

    const first = await verification.verify({
      authority: 'S-dupe',
      status: 'OK',
      requestId: `${requestIdPrefix}-dupe-1`,
    });
    const second = await verification.verify({
      authority: 'S-dupe',
      status: 'OK',
      requestId: `${requestIdPrefix}-dupe-2`,
    });

    expect(first.data.verification.outcome).toBe('VERIFIED');
    expect(second.data.verification).toMatchObject({ outcome: 'REPLAY', status: 'PAID' });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(prisma.paymentTransition.count({ where: { paymentId: payment.id } })).resolves.toBe(1);
    await expect(prisma.orderTransition.count({ where: { orderId: order.id, to: 'PAID' } })).resolves.toBe(1);
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillment: { orderId: order.id }, from: null } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED' } })).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'CONSUMED' } })).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count({ where: { referenceId: order.id, type: 'SALE' } })).resolves.toBe(1);
    await expect(balanceOf()).resolves.toMatchObject({ onHand: 0, reserved: 0 });
  });

  it('coalesces concurrent duplicate callbacks into a single settlement', async () => {
    const order = await createOrderWithReservation('race2', 2);
    await createPayment(order.id, 'S-race2', 'race2');

    const results = await Promise.all([
      verification.verify({ authority: 'S-race2', status: 'OK', requestId: `${requestIdPrefix}-race2-a` }),
      verification.verify({ authority: 'S-race2', status: 'OK', requestId: `${requestIdPrefix}-race2-b` }),
    ]);

    const outcomes = results.map((result) => result.data.verification.outcome).sort();
    expect(outcomes).toEqual(['REPLAY', 'VERIFIED']);

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(prisma.paymentTransition.count({ where: { paymentId: payment.id, to: 'PAID' } })).resolves.toBe(1);
    await expect(prisma.fulfillmentTransition.count({ where: { fulfillment: { orderId: order.id }, from: null } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED' } })).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'CONSUMED' } })).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count({ where: { referenceId: order.id, type: 'SALE' } })).resolves.toBe(1);
    await expect(balanceOf()).resolves.toMatchObject({ onHand: 0, reserved: 0 });
  });

  it('marks a NOK callback as NOT_PAID without contacting the gateway', async () => {
    const order = await createOrderWithReservation('nok', 2);
    await createPayment(order.id, 'S-nok', 'nok');

    const result = await verification.verify({
      authority: 'S-nok',
      status: 'NOK',
      requestId: `${requestIdPrefix}-nok`,
    });

    expect(provider.verify).not.toHaveBeenCalled();
    expect(result.data.verification).toMatchObject({ status: 'FAILED', outcome: 'NOT_PAID' });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('FAILED');
    await expect(
      prisma.paymentTransition.findFirstOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ from: 'PENDING', to: 'FAILED', reason: 'gateway_not_paid' });
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'PENDING_PAYMENT' });
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(0);
  });

  it('records NOT_PAID when the provider deterministically reports no settlement', async () => {
    const order = await createOrderWithReservation('failed', 2);
    await createPayment(order.id, 'S-failed', 'failed');
    provider.verify.mockResolvedValue({ status: 'failed', reason: 'amount' } as const);

    const result = await verification.verify({
      authority: 'S-failed',
      status: 'OK',
      requestId: `${requestIdPrefix}-failed`,
    });

    expect(result.data.verification).toMatchObject({ status: 'FAILED', outcome: 'NOT_PAID' });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('FAILED');
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(0);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
  });

  it('surfaces upstream unavailability and leaves the payment untouched', async () => {
    const order = await createOrderWithReservation('unavail', 2);
    await createPayment(order.id, 'S-unavail', 'unavail');
    provider.verify.mockResolvedValue({ status: 'unavailable' } as const);

    await expect(
      verification.verify({
        authority: 'S-unavail',
        status: 'OK',
        requestId: `${requestIdPrefix}-unavail`,
      }),
    ).rejects.toMatchObject({ response: { code: 'UPSTREAM_UNAVAILABLE' } });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('PENDING');
    await expect(prisma.paymentTransition.count({ where: { paymentId: payment.id } })).resolves.toBe(0);
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(0);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
    await expect(balanceOf()).resolves.toMatchObject({ onHand: 2, reserved: 2 });
  });

  it('keeps the payment PENDING and emits one reconciliation record for an ambiguous verify', async () => {
    const order = await createOrderWithReservation('unconf', 2);
    await createPayment(order.id, 'S-unconf', 'unconf');
    provider.verify.mockResolvedValue({ status: 'unknown_result' } as const);

    const first = await verification.verify({
      authority: 'S-unconf',
      status: 'OK',
      requestId: `${requestIdPrefix}-unconf-1`,
    });
    const second = await verification.verify({
      authority: 'S-unconf',
      status: 'OK',
      requestId: `${requestIdPrefix}-unconf-2`,
    });

    expect(first.data.verification).toMatchObject({ status: 'PENDING', outcome: 'ACCEPTED_UNCONFIRMED' });
    expect(second.data.verification.outcome).toBe('ACCEPTED_UNCONFIRMED');

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('PENDING');
    await expect(prisma.paymentTransition.count({ where: { paymentId: payment.id } })).resolves.toBe(0);
    await expect(
      prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFICATION_UNCONFIRMED' } }),
    ).resolves.toBe(1);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
  });

  it('rejects a forged authority with a 404 and no provider call', async () => {
    await expect(
      verification.verify({
        authority: 'S-forged-unknown',
        status: 'OK',
        requestId: `${requestIdPrefix}-forged`,
      }),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it('rejects a settled amount that no longer matches the order total', async () => {
    const order = await createOrderWithReservation('amount', 2);
    await createPayment(order.id, 'S-amount', 'amount', { amount: 999n });

    await expect(
      verification.verify({
        authority: 'S-amount',
        status: 'OK',
        requestId: `${requestIdPrefix}-amount`,
      }),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_STATE_CONFLICT' } });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('PENDING');
    await expect(prisma.outboxEvent.count({ where: { aggregateId: order.id } })).resolves.toBe(0);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'ACTIVE' } })).resolves.toBe(1);
  });

  it('rejects a payment that belongs to another gateway environment', async () => {
    const order = await createOrderWithReservation('env', 2);
    await createPayment(order.id, 'S-env', 'env', { gatewayEnvironment: 'live' });

    await expect(
      verification.verify({
        authority: 'S-env',
        status: 'OK',
        requestId: `${requestIdPrefix}-env`,
      }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    expect(provider.verify).not.toHaveBeenCalled();
  });

  it('settles money after a concurrent customer cancellation without consuming stock', async () => {
    const order = await createOrderWithReservation('race-cancel', 2);
    await createPayment(order.id, 'S-race-cancel', 'race-cancel');
    provider.verify.mockImplementation(async () => {
      await delay(200);
      return { status: 'verified', referenceId: 'REF-LATE' } as const;
    });

    const verifyPromise = verification.verify({
      authority: 'S-race-cancel',
      status: 'OK',
      requestId: `${requestIdPrefix}-race-cancel-verify`,
    });
    await delay(50);
    const cancel = await commands.cancelAsCustomer(customerUser, order.id, {
      idempotencyKey: `race-cancel-key-${runId}`,
      requestId: `${requestIdPrefix}-race-cancel-order`,
    });

    expect(cancel.data.order.status).toBe('CANCELLED');
    const verified = await verifyPromise;
    expect(verified.data.verification).toMatchObject({
      status: 'PAID',
      outcome: 'VERIFIED_AFTER_CANCELLED',
      orderStatus: 'CANCELLED',
    });

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('PAID');
    await expect(
      prisma.paymentTransition.findFirstOrThrow({ where: { paymentId: payment.id } }),
    ).resolves.toMatchObject({ from: 'PENDING', to: 'PAID', reason: 'GATEWAY_VERIFIED' });

    await expect(
      prisma.outboxEvent.findFirstOrThrow({
        where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED_AFTER_CANCELLED' },
      }),
    ).resolves.toMatchObject({ deduplicationKey: `payment-verified-after-cancelled:${payment.id}` });
    await expect(
      prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED' } }),
    ).resolves.toBe(0);

    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'CONSUMED' } })).resolves.toBe(0);
    await expect(prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } })).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count({ where: { referenceId: order.id, type: 'SALE' } })).resolves.toBe(0);
    await expect(prisma.fulfillment.count({ where: { orderId: order.id } })).resolves.toBe(0);
    await expect(balanceOf()).resolves.toMatchObject({ onHand: 2, reserved: 0, available: 2 });
  });

  it('settles money after the reservation-expiry worker closed the order without double-consume', async () => {
    const order = await createOrderWithReservation('race-expire', 2);
    await createPayment(order.id, 'S-race-expire', 'race-expire');
    await makeOverdue(order.id);
    await commands.expirePendingPaymentOrders(
      { actorId: staffUser, requestId: `${requestIdPrefix}-expiry` },
      { now: new Date() },
    );
    await expect(prisma.order.findUniqueOrThrow({ where: { id: order.id } })).resolves.toMatchObject({ status: 'CANCELLED' });

    const result = await verification.verify({
      authority: 'S-race-expire',
      status: 'OK',
      requestId: `${requestIdPrefix}-race-expire-verify`,
    });

    expect(result.data.verification).toMatchObject({
      status: 'PAID',
      outcome: 'VERIFIED_AFTER_CANCELLED',
      orderStatus: 'CANCELLED',
    });
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe('PAID');
    await expect(
      prisma.outboxEvent.count({ where: { aggregateId: payment.id, topic: 'PAYMENT_VERIFIED_AFTER_CANCELLED' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.stockReservation.count({ where: { orderId: order.id, status: 'RELEASED' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.stockReservation.count({ where: { orderId: order.id, status: 'CONSUMED' } }),
    ).resolves.toBe(0);
    await expect(prisma.inventoryMovement.count({ where: { referenceId: order.id, type: 'SALE' } })).resolves.toBe(0);
    await expect(balanceOf()).resolves.toMatchObject({ onHand: 2, reserved: 0, available: 2 });
  });

  async function createOrderWithReservation(suffix: string, quantity: number) {
    const orderId = `${runId}-order-${suffix}`;
    const number = `PAYVERIFY-${runId}-${suffix}`;
    const future = new Date(Date.now() + 1_800_000);
    await prisma.order.create({
      data: {
        id: orderId,
        number,
        customerId,
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
    await prisma.inventoryBalance.upsert({
      where: { warehouseId_locationId_variantId: { warehouseId, locationId: locationAId, variantId: variantAId } },
      create: { warehouseId, locationId: locationAId, variantId: variantAId, onHand: quantity, reserved: quantity, available: 0, version: 1 },
      update: { onHand: quantity, reserved: quantity, available: 0, version: { increment: 1 } },
    });
    await prisma.stockReservation.create({
      data: {
        orderId,
        warehouseId,
        locationId: locationAId,
        variantId: variantAId,
        quantity,
        status: 'ACTIVE',
        expiresAt: future,
      },
    });
    return { id: orderId, number };
  }

  async function createPayment(
    orderId: string,
    authority: string,
    suffix: string,
    overrides: { amount?: bigint; gatewayEnvironment?: string } = {},
  ) {
    const correlationId = `${requestIdPrefix}-${suffix}`;
    return prisma.payment.create({
      data: {
        orderId,
        provider: 'zarinpal',
        amount: overrides.amount ?? 150n,
        status: 'PENDING',
        authority,
        idempotencyKey: sha256(`verify-${authority}`),
        idempotencyFingerprint: sha256(JSON.stringify({ scope: 'payment.verification.integration', orderId })),
        correlationId,
        gatewayEnvironment: overrides.gatewayEnvironment ?? 'sandbox',
      },
    });
  }

  async function balanceOf() {
    return prisma.inventoryBalance.findUniqueOrThrow({
      where: { warehouseId_locationId_variantId: { warehouseId, locationId: locationAId, variantId: variantAId } },
    });
  }

  async function makeOverdue(orderId: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: { reservationExpiresAt: new Date(Date.now() - 60_000) },
    });
  }

  async function resetState() {
    const orderIds = (
      await prisma.order.findMany({
        where: { customerId: { in: [customerId, otherCustomerId] } },
        select: { id: true },
      })
    ).map((order) => order.id);
    if (orderIds.length === 0) return;

    const paymentIds = (
      await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } })
    ).map((payment) => payment.id);
    if (paymentIds.length > 0) {
      await prisma.paymentTransition.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    }
    await prisma.fulfillmentTransition.deleteMany({ where: { fulfillment: { orderId: { in: orderIds } } } });
    await prisma.fulfillment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderTransition.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderCommandIdempotencyRecord.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.stockReservation.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({
      where: { aggregateId: { in: [...orderIds, ...paymentIds] } },
    });
    await prisma.inventoryMovement.deleteMany({
      where: { referenceType: 'order', referenceId: { in: orderIds } },
    });
    await prisma.auditLog.deleteMany({ where: { requestId: { startsWith: requestIdPrefix } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.inventoryBalance.upsert({
      where: { warehouseId_locationId_variantId: { warehouseId, locationId: locationAId, variantId: variantAId } },
      create: { warehouseId, locationId: locationAId, variantId: variantAId, onHand: 0, reserved: 0, available: 0, version: 1 },
      update: { onHand: 0, reserved: 0, available: 0, version: { increment: 1 } },
    });
  }
});
