import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { assertIsolatedTestDatabase } from '../../test/database-url.guard';
import { AdminPaymentRefundService } from './admin-payment-refund.service';

function numericSuffix(value: string, index: number): string {
  const digits = value.replaceAll(/\D/gu, '').slice(0, 8).padStart(8, '0');
  return `${digits.slice(0, 7)}${(Number(digits.slice(-1)) + index) % 10}`;
}

function uniqueReference(runId: string, label: string): string {
  return `ZR-REF-${runId}-${label}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

describe.sequential('AdminPaymentRefundService database integration', () => {
  const runId = randomUUID().replaceAll('-', '').slice(0, 20);
  const userId = `refund_user_${runId}`;
  const customerId = `refund_customer_${runId}`;
  const orderIds: string[] = [];

  const prisma = new PrismaService();
  const audit = { record: async () => undefined };
  const service = new AdminPaymentRefundService(prisma, audit as never);
  let connected = false;

  beforeAll(async () => {
    assertIsolatedTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      nodeEnvironment: process.env.NODE_ENV,
    });
    await prisma.$connect();
    connected = true;

    await prisma.user.create({
      data: {
        id: userId,
        mobile: `+9890${numericSuffix(runId, 0)}`,
        status: 'ACTIVE',
        isMobileVerified: true,
        mobileVerifiedAt: new Date(),
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.customer.create({ data: { id: customerId, userId, mobile: `+9890${numericSuffix(runId, 1)}` } });
  });

  afterAll(async () => {
    if (!connected) return;
    await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: await paymentIds() } } });
    await prisma.$transaction(async (tx) => {
      // The refund total is kept honest by a deferred constraint trigger, so the
      // running total has to go back to zero in the same transaction as the rows.
      await tx.payment.updateMany({ where: { orderId: { in: orderIds } }, data: { refundedAmount: 0n } });
      await tx.refund.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await tx.paymentTransition.deleteMany({ where: { payment: { orderId: { in: orderIds } } } });
      await tx.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function paymentIds(): Promise<string[]> {
    const rows = await prisma.payment.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async function createPaidPayment(
    label: string,
    overrides: { amount?: bigint; status?: 'PAID' | 'PENDING' } = {},
  ): Promise<{ id: string; orderId: string }> {
    const orderId = `refund_order_${runId}_${label}`;
    const number = `REFUND-${runId}-${label}`;
    orderIds.push(orderId);
    await prisma.order.create({
      data: {
        id: orderId,
        number,
        customerId,
        status: 'PAID',
        subtotal: overrides.amount ?? 1000n,
        discount: 0n,
        shipping: 0n,
        grandTotal: overrides.amount ?? 1000n,
        addressSnapshot: { test: true },
        shippingMethod: 'STANDARD',
        shippingMethodTitle: 'Standard shipping',
        shippingPolicyRevision: 'shipping-standard-v1',
        pricePolicyRevision: 'catalog-sale-price-v1',
        reservationExpiresAt: new Date(Date.now() + 1_800_000),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId,
        provider: 'zarinpal',
        amount: overrides.amount ?? 1000n,
        status: overrides.status ?? 'PAID',
        authority: overrides.status === 'PENDING' ? `A${sha256(`${runId}-${label}`).slice(0, 40)}` : null,
        idempotencyKey: sha256(`refund-fixture-key-${runId}-${label}`),
        idempotencyFingerprint: sha256(`refund-fixture-fingerprint-${runId}-${label}`),
        correlationId: `C${sha256(`refund-${runId}-${label}`).slice(0, 40)}`,
        gatewayEnvironment: 'sandbox',
      },
      select: { id: true, orderId: true },
    });
    return payment;
  }

  function request(paymentId: string, key: string, overrides: Record<string, unknown> = {}) {
    return {
      paymentId,
      actorId: userId,
      requestId: `req-${runId}-${key}`,
      idempotencyKey: key,
      amountMinorUnits: '400',
      gatewayReferenceId: uniqueReference(runId, key),
      reason: 'CANCELLED_SHIPMENT',
      ...overrides,
    };
  }

  it('records a partial refund, its transition, its event, and leaves the order PAID', async () => {
    const payment = await createPaidPayment('partial');
    const { data } = await service.record(request(payment.id, 'partial-1'));

    expect(data.refund).toMatchObject({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: { amount: '400', currency: 'IRR' },
      status: 'RECORDED',
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundedTotal: { amount: '400' },
      remainingRefundable: { amount: '600' },
    });

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('PARTIALLY_REFUNDED');
    expect(stored.refundedAmount).toBe(400n);

    const transition = await prisma.paymentTransition.findFirstOrThrow({
      where: { paymentId: payment.id, to: 'PARTIALLY_REFUNDED' },
    });
    expect(transition).toMatchObject({
      from: 'PAID',
      to: 'PARTIALLY_REFUNDED',
      actorId: userId,
      requestId: `req-${runId}-partial-1`,
    });

    const event = await prisma.outboxEvent.findFirstOrThrow({
      where: { topic: 'PAYMENT_REFUNDED', aggregateId: payment.id },
    });
    expect(event.deduplicationKey).toBe(`payment-refunded:${data.refund.refundId}`);
    expect(event.payload).toMatchObject({ refundId: data.refund.refundId, amount: '400', currency: 'IRR' });

    const order = await prisma.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    expect(order.status).toBe('PAID');
  });

  it('never stores the idempotency key or fingerprint material in plaintext columns', async () => {
    const payment = await createPaidPayment('secret');
    await service.record(request(payment.id, 'secret-1'));
    const refund = await prisma.refund.findFirstOrThrow({ where: { paymentId: payment.id } });

    expect(refund.idempotencyKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(refund.idempotencyFingerprint).toMatch(/^[0-9a-f]{64}$/u);
    expect(refund.idempotencyKey).not.toContain('secret-1');
  });

  it('completes the payment when the remaining money is returned', async () => {
    const payment = await createPaidPayment('complete');
    await service.record(request(payment.id, 'complete-1'));
    const { data } = await service.record(
      request(payment.id, 'complete-2', { amountMinorUnits: '600' }),
    );

    expect(data.refund.paymentStatus).toBe('REFUNDED');
    expect(data.refund.remainingRefundable).toEqual({ amount: '0', currency: 'IRR' });
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('REFUNDED');
    expect(stored.refundedAmount).toBe(stored.amount);
  });

  it('accepts a second partial refund without inventing a self-transition', async () => {
    const payment = await createPaidPayment('repeat-partial', { amount: 1000n });

    const first = await service.record(
      request(payment.id, 'repeat-partial-1', { amountMinorUnits: '300' }),
    );
    const second = await service.record(
      request(payment.id, 'repeat-partial-2', { amountMinorUnits: '200' }),
    );

    expect(first.data.refund.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(second.data.refund.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(second.data.refund.refundedTotal).toEqual({ amount: '500', currency: 'IRR' });

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('PARTIALLY_REFUNDED');
    expect(stored.refundedAmount).toBe(500n);
    // The status only moved once, so exactly one status transition exists.
    const transitions = await prisma.paymentTransition.findMany({
      where: { paymentId: payment.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(transitions).toHaveLength(1);
    expect(transitions[0]).toMatchObject({ from: 'PAID', to: 'PARTIALLY_REFUNDED' });
    // Both money movements are still evidenced.
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(2);
    expect(
      await prisma.outboxEvent.count({ where: { topic: 'PAYMENT_REFUNDED', aggregateId: payment.id } }),
    ).toBe(2);

    // The remainder completes the payment through a real status change.
    const final = await service.record(
      request(payment.id, 'repeat-partial-3', { amountMinorUnits: '500' }),
    );
    expect(final.data.refund.paymentStatus).toBe('REFUNDED');
    const settled = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(settled.refundedAmount).toBe(settled.amount);
    expect(settled.status).toBe('REFUNDED');
    expect(
      (await prisma.paymentTransition.findMany({ where: { paymentId: payment.id } })).map(
        (transition) => `${transition.from}->${transition.to}`,
      ),
    ).toEqual(['PAID->PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED->REFUNDED']);
  });

  it('replays the same refund for a repeated key and writes nothing new', async () => {
    const payment = await createPaidPayment('replay');
    const first = await service.record(request(payment.id, 'replay-1'));
    const second = await service.record(request(payment.id, 'replay-1', { requestId: 'req-retry' }));

    expect(second.data.refund.refundId).toBe(first.data.refund.refundId);
    expect(second.data.refund.createdAt).toBe(first.data.refund.createdAt);
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { topic: 'PAYMENT_REFUNDED', aggregateId: payment.id } })).toBe(1);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.refundedAmount).toBe(400n);
  });

  it('refuses a changed payload under the same key', async () => {
    const payment = await createPaidPayment('conflict');
    await service.record(request(payment.id, 'conflict-1'));
    await expect(
      service.record(request(payment.id, 'conflict-1', { amountMinorUnits: '500' })),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it('refuses to refund more than the payment captured', async () => {
    const payment = await createPaidPayment('over');
    await expect(
      service.record(request(payment.id, 'over-1', { amountMinorUnits: '1001' })),
    ).rejects.toMatchObject({ response: { code: 'REFUND_AMOUNT_EXCEEDS_REMAINING' } });

    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.refundedAmount).toBe(0n);
    expect(stored.status).toBe('PAID');
  });

  it('refuses a payment that was never settled', async () => {
    const payment = await createPaidPayment('unsettled', { status: 'PENDING' });
    await expect(
      service.record(request(payment.id, 'unsettled-1')),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_STATE_CONFLICT' } });
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(0);
  });

  it('refuses a second refund of a fully refunded payment', async () => {
    const payment = await createPaidPayment('full');
    await service.record(request(payment.id, 'full-1', { amountMinorUnits: '1000' }));
    await expect(
      service.record(request(payment.id, 'full-2', { amountMinorUnits: '1' })),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_STATE_CONFLICT' } });
  });

  it('refuses to reuse a gateway reference for another refund', async () => {
    const first = await createPaidPayment('reference-a');
    const second = await createPaidPayment('reference-b');
    const reference = uniqueReference(runId, 'shared');
    await service.record(request(first.id, 'reference-a-1', { gatewayReferenceId: reference }));
    await expect(
      service.record(request(second.id, 'reference-b-1', { gatewayReferenceId: reference })),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(await prisma.refund.count({ where: { gatewayReferenceId: reference } })).toBe(1);
  });

  it('keeps the total inside the captured amount when two refunds race', async () => {
    const payment = await createPaidPayment('race', { amount: 1000n });
    const results = await Promise.allSettled([
      service.record(request(payment.id, 'race-1', { amountMinorUnits: '600' })),
      service.record(request(payment.id, 'race-2', { amountMinorUnits: '600' })),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const stored = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.refundedAmount).toBe(600n);
    expect(stored.refundedAmount).toBeLessThanOrEqual(stored.amount);
    expect(stored.status).toBe('PARTIALLY_REFUNDED');
    expect(await prisma.refund.count({ where: { paymentId: payment.id } })).toBe(1);
  });

  it('lets the database refuse a total above the captured amount', async () => {
    const payment = await createPaidPayment('constraint', { amount: 1000n });
    await expect(
      prisma.payment.update({
        where: { id: payment.id },
        data: { refundedAmount: 1001n },
      }),
    ).rejects.toThrow(/refundedAmount|within_amount/iu);
    await expect(
      prisma.payment.update({
        where: { id: payment.id },
        data: { refundedAmount: -1n },
      }),
    ).rejects.toThrow(/refundedAmount|within_amount/iu);
  });
});
