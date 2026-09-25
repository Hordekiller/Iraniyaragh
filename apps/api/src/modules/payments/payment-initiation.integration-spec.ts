import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import type { PaymentAuthorizeRequest, PaymentAuthorizeResult, PaymentGatewayConfig } from './payment-provider.port';
import { PaymentInitiationService } from './payment-initiation.service';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function initiationFingerprint(orderId: string): string {
  return hash(
    JSON.stringify({
      scope: 'payment.initiation',
      orderId,
      provider: 'zarinpal',
    }),
  );
}

class FakeProvider {
  readonly providerName = 'zarinpal' as const;
  readonly authorize = vi.fn(
    async (request: PaymentAuthorizeRequest): Promise<PaymentAuthorizeResult> => ({
      status: 'redirect' as const,
      authority: `S${request.correlationId}-authority`,
      redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/S${request.correlationId}-authority`,
    }),
  );
}

function createBarrier(parties: number): { wait: () => Promise<void> } {
  let arrived = 0;
  let release: (() => void) | null = null;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    wait: async () => {
      arrived += 1;
      if (arrived >= parties) release?.();
      await open;
    },
  };
}

describe.sequential('PaymentInitiationService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `payment_init_user_${runId}`;
  const otherUserId = `payment_init_other_user_${runId}`;
  const customerId = `payment_init_customer_${runId}`;
  const otherCustomerId = `payment_init_other_customer_${runId}`;
  const foreignOrderId = `payment_init_foreign_order_${runId}`;
  const paidOrderId = `payment_init_paid_order_${runId}`;
  const createdOrderIds: string[] = [foreignOrderId, paidOrderId];

  const gatewayConfig: PaymentGatewayConfig = {
    providerName: 'zarinpal',
    mode: 'sandbox',
    callbackUrl: 'http://localhost:4321/api/v1/payments/zarinpal/callback',
    timeoutMs: 100,
  };

  const prisma = new PrismaService();
  const provider = new FakeProvider();
  const service = new PaymentInitiationService(prisma, provider as never, gatewayConfig as never);
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
        { id: userId, mobile: `+9890${numericSuffix(runId, 0)}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
        { id: otherUserId, mobile: `+9890${numericSuffix(runId, 1)}`, status: 'ACTIVE', isMobileVerified: true, mobileVerifiedAt: new Date(), createdAt: new Date(Date.now() - 60_000) },
      ],
    });
    await prisma.customer.createMany({
      data: [
        { id: customerId, userId, mobile: `+9890${numericSuffix(runId, 2)}` },
        { id: otherCustomerId, userId: otherUserId, mobile: `+9890${numericSuffix(runId, 3)}` },
      ],
    });

    const shared = {
      addressSnapshot: { test: true },
      shippingMethod: 'STANDARD',
      shippingMethodTitle: 'Standard shipping',
      shippingPolicyRevision: 'shipping-standard-v1',
      pricePolicyRevision: 'catalog-sale-price-v1',
      reservationExpiresAt: new Date(Date.now() + 1_800_000),
    } as const;

    await prisma.order.createMany({
      data: [
        { id: foreignOrderId, number: `PAYINIT-${runId}-foreign`, customerId: otherCustomerId, status: 'PENDING_PAYMENT', subtotal: 100n, discount: 0n, shipping: 0n, grandTotal: 100n, ...shared },
        { id: paidOrderId, number: `PAYINIT-${runId}-paid`, customerId, status: 'PAID', subtotal: 100n, discount: 0n, shipping: 0n, grandTotal: 100n, ...shared },
      ],
    });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.paymentTransition.deleteMany({
      where: { payment: { orderId: { in: createdOrderIds } } },
    });
    await prisma.payment.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await prisma.order.deleteMany({
      where: { id: { in: createdOrderIds } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerId, otherCustomerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    provider.authorize.mockClear();
    provider.authorize.mockImplementation(
      async (request: PaymentAuthorizeRequest): Promise<PaymentAuthorizeResult> => ({
        status: 'redirect',
        authority: `S${request.correlationId}-authority`,
        redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/S${request.correlationId}-authority`,
      }),
    );
  });

  async function createOrder(suffix: string, ownerCustomerId: string): Promise<{ id: string; number: string }> {
    const id = `payment_init_order_${runId}_${suffix}`;
    const number = `PAYINIT-${runId}-${suffix}`;
    const shared = {
      subtotal: 100n,
      discount: 0n,
      shipping: 50n,
      grandTotal: 150n,
      addressSnapshot: { test: true },
      shippingMethod: 'STANDARD',
      shippingMethodTitle: 'Standard shipping',
      shippingPolicyRevision: 'shipping-standard-v1',
      pricePolicyRevision: 'catalog-sale-price-v1',
      reservationExpiresAt: new Date(Date.now() + 1_800_000),
    } as const;
    await prisma.order.create({
      data: { id, number, customerId: ownerCustomerId, status: 'PENDING_PAYMENT', ...shared },
    });
    createdOrderIds.push(id);
    return { id, number };
  }

  it('durably records the attempt, uses the server amount, and returns a redirect', async () => {
    const { id } = await createOrder('verify', customerId);
    const requestId = `${runId}-pay-1`;

    const result = await service.initiate({
      userId,
      orderId: id,
      idempotencyKey: `key-${runId}-1`,
      requestId,
    });

    expect(result.data.payment).toMatchObject({
      status: 'PENDING',
      provider: 'zarinpal',
      amount: { amount: '150', currency: 'IRR' },
      authority: `S${requestId}-authority`,
      redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/S${requestId}-authority`,
    });

    expect(provider.authorize).toHaveBeenCalledOnce();
    expect(provider.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: id,
        amountMinorUnits: '150',
        currency: 'IRR',
        callbackUrl: gatewayConfig.callbackUrl,
        correlationId: requestId,
      }),
    );

    const row = await prisma.payment.findUnique({ where: { id: result.data.payment.paymentId } });
    expect(row).toMatchObject({
      orderId: id,
      provider: 'zarinpal',
      amount: 150n,
      status: 'PENDING',
      authority: `S${requestId}-authority`,
      idempotencyKey: hash(`key-${runId}-1`),
      idempotencyFingerprint: initiationFingerprint(id),
      correlationId: requestId,
      gatewayEnvironment: 'sandbox',
    });
  });

  it('replays the same idempotency key with the stored authority and never re-calls the gateway', async () => {
    const { id } = await createOrder('replay', customerId);
    const first = await service.initiate({
      userId,
      orderId: id,
      idempotencyKey: `key-${runId}-replay`,
      requestId: `${runId}-replay-1`,
    });
    provider.authorize.mockClear();

    const second = await service.initiate({
      userId,
      orderId: id,
      idempotencyKey: `key-${runId}-replay`,
      requestId: `${runId}-replay-2`,
    });

    expect(first.data.payment.authority).toBe(`S${runId}-replay-1-authority`);
    expect(second.data.payment.authority).toBe(`S${runId}-replay-1-authority`);
    expect(provider.authorize).not.toHaveBeenCalled();
    await expect(prisma.payment.count({ where: { orderId: id } })).resolves.toBe(1);
  });

  it('keeps a single active pending payment per order across different keys', async () => {
    const { id } = await createOrder('activereplay', customerId);

    const first = await service.initiate({
      userId,
      orderId: id,
      idempotencyKey: `key-${runId}-active-1`,
      requestId: `${runId}-active-1`,
    });
    provider.authorize.mockClear();

    const second = await service.initiate({
      userId,
      orderId: id,
      idempotencyKey: `key-${runId}-active-2`,
      requestId: `${runId}-active-2`,
    });

    expect(second.data.payment.paymentId).toBe(first.data.payment.paymentId);
    expect(second.data.payment.authority).toBe(`S${runId}-active-1-authority`);
    expect(provider.authorize).not.toHaveBeenCalled();
    await expect(prisma.payment.count({ where: { orderId: id, status: 'PENDING' } })).resolves.toBe(1);
  });

  it('never lets a slow concurrent authorization overwrite the stored authority', async () => {
    const { id } = await createOrder('raceauthority', customerId);
    const gate = createBarrier(2);
    const concurrent = new FakeProvider();
    concurrent.authorize.mockImplementation(async (request: PaymentAuthorizeRequest) => {
      // Both in-flight authorizations are held until the second one is also
      // waiting, so the slower response is guaranteed to write last.
      await gate.wait();
      return {
        status: 'redirect' as const,
        authority: `S${request.correlationId}-authority`,
        redirectUrl: `https://sandbox.zarinpal.com/pg/StartPay/S${request.correlationId}-authority`,
      };
    });
    const racing = new PaymentInitiationService(
      prisma,
      concurrent as never,
      gatewayConfig as never,
    );

    const [slow, fast] = await Promise.all([
      racing.initiate({
        userId,
        orderId: id,
        idempotencyKey: `key-${runId}-race-slow`,
        requestId: `${runId}-race-slow`,
      }),
      racing.initiate({
        userId,
        orderId: id,
        idempotencyKey: `key-${runId}-race-fast`,
        requestId: `${runId}-race-fast`,
      }),
    ]);

    const stored = await prisma.payment.findFirstOrThrow({
      where: { orderId: id, status: 'PENDING' },
      select: { id: true, authority: true },
    });
    await expect(prisma.payment.count({ where: { orderId: id } })).resolves.toBe(1);
    // Exactly one authority is persisted, and both responses point at it, so the
    // authority the buyer actually paid with can still be matched to this payment.
    expect([slow.data.payment.authority, fast.data.payment.authority]).toContain(
      stored.authority,
    );
    expect(new Set([slow.data.payment.paymentId, fast.data.payment.paymentId])).toEqual(
      new Set([stored.id]),
    );
    expect(new Set([slow.data.payment.authority, fast.data.payment.authority]).size).toBe(1);
  });

  it('does not expose a foreign order to the caller', async () => {
    await expect(
      service.initiate({
        userId,
        orderId: foreignOrderId,
        idempotencyKey: `key-${runId}-foreign`,
        requestId: `${runId}-foreign`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });
    expect(provider.authorize).not.toHaveBeenCalled();
  });

  it('refuses initiation for an order that left PENDING_PAYMENT', async () => {
    await expect(
      service.initiate({
        userId,
        orderId: paidOrderId,
        idempotencyKey: `key-${runId}-paid`,
        requestId: `${runId}-paid`,
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_STATE_CONFLICT' } });
  });

  it('persists a FAILED transition with the gateway_rejected reason on rejection', async () => {
    const { id } = await createOrder('rejected', customerId);
    provider.authorize.mockImplementation(async () => ({ status: 'rejected', reason: 'invalid_request' }));

    await expect(
      service.initiate({
        userId,
        orderId: id,
        idempotencyKey: `key-${runId}-reject`,
        requestId: `${runId}-reject`,
      }),
    ).rejects.toMatchObject({ response: { code: 'UNPROCESSABLE' } });
    expect(provider.authorize).toHaveBeenCalledOnce();

    const payment = await prisma.payment.findFirst({ where: { orderId: id, status: 'FAILED' } });
    expect(payment).not.toBeNull();
    expect(payment?.idempotencyKey).toBe(hash(`key-${runId}-reject`));
    const transition = await prisma.paymentTransition.findFirst({
      where: { paymentId: payment?.id },
    });
    expect(transition).toMatchObject({
      from: 'PENDING',
      to: 'FAILED',
      reason: 'gateway_rejected',
      requestId: `${runId}-reject`,
    });
  });

  it('persists an unconfirmed FAILED outcome without auto-retry on unknown_result', async () => {
    const { id } = await createOrder('unconfirmed', customerId);
    provider.authorize.mockImplementation(async () => ({ status: 'unknown_result' }));

    const attempt = () =>
      service.initiate({
        userId,
        orderId: id,
        idempotencyKey: `key-${runId}-unconfirmed`,
        requestId: `${runId}-unconfirmed`,
      });

    await expect(attempt()).rejects.toMatchObject({
      response: { code: 'PAYMENT_RESULT_UNCONFIRMED' },
    });
    expect(provider.authorize).toHaveBeenCalledOnce();

    const payment = await prisma.payment.findFirst({
      where: { orderId: id, status: 'FAILED' },
    });
    expect(payment).not.toBeNull();
    const transition = await prisma.paymentTransition.findFirst({
      where: { paymentId: payment?.id },
    });
    expect(transition?.reason).toBe('gateway_unconfirmed');
  });
});

function numericSuffix(value: string, index: number): string {
  const digits = value.replaceAll(/\D/gu, '').slice(0, 8).padStart(8, '0');
  return `${digits.slice(0, 7)}${(Number(digits.slice(-1)) + index) % 10}`;
}