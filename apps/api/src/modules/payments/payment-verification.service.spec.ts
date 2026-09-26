import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentGatewayConfig, PaymentProvider } from './payment-provider.port';
import { PaymentVerificationService } from './payment-verification.service';

const gatewayConfig: PaymentGatewayConfig = {
  providerName: 'zarinpal',
  mode: 'sandbox',
  callbackUrl: 'http://localhost:4321/api/v1/payments/zarinpal/callback',
  timeoutMs: 100,
};

const paymentRow = {
  id: 'payment-1',
  orderId: 'order-1',
  provider: 'zarinpal',
  amount: 250000n,
  status: 'PENDING',
  authority: 'AUTHORITY-1',
  referenceId: null,
  gatewayEnvironment: 'sandbox',
  order: { id: 'order-1', status: 'PENDING_PAYMENT', grandTotal: 250000n },
};

function setup(overrides: {
  entry?: typeof paymentRow | null;
  settled?: typeof paymentRow;
  providerResult?: ReturnType<PaymentProvider['verify']>;
} = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    payment: {
      findUnique: vi.fn().mockResolvedValue(overrides.settled ?? paymentRow),
      update: vi.fn((args: { where: { id: string }; data: { referenceId: string } }) =>
        Promise.resolve({ ...paymentRow, referenceId: args.data.referenceId }),
      ),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    paymentTransition: { create: vi.fn().mockResolvedValue({ id: 'transition-1' }) },
    orderTransition: { create: vi.fn().mockResolvedValue({ id: 'order-transition-1' }) },
    order: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    fulfillment: { upsert: vi.fn().mockResolvedValue({ id: 'fulfillment-1', orderId: 'order-1' }) },
    fulfillmentTransition: { createMany: vi.fn().mockResolvedValue({ count: 1 }) },
    outboxEvent: {
      create: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
  const provider = {
    providerName: 'zarinpal',
    verify: vi.fn().mockResolvedValue(
      overrides.providerResult ?? { status: 'verified', referenceId: 'REF-1' },
    ),
  } as PaymentProvider & { verify: ReturnType<typeof vi.fn> };
  const prisma = {
    payment: {
      findFirst: vi.fn().mockResolvedValue(overrides.entry === undefined ? paymentRow : overrides.entry),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn(tx as never)),
  };
  const auditLog = { record: vi.fn().mockResolvedValue(undefined) };
  const inventory = { consumeReservationsForOrder: vi.fn().mockResolvedValue(2) };
  const service = new PaymentVerificationService(
    prisma as never,
    provider as never,
    gatewayConfig,
    auditLog as never,
    inventory as never,
  );
  return {
    tx: tx as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
    prisma: prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
    provider,
    auditLog: auditLog as unknown as Record<string, ReturnType<typeof vi.fn>>,
    inventory: inventory as unknown as Record<string, ReturnType<typeof vi.fn>>,
    service,
  };
}

describe('PaymentVerificationService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('settles the payment, order, inventory and fulfillment in one transaction', async () => {
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });

    expect(result).toEqual({
      data: {
        verification: {
          paymentId: 'payment-1',
          status: 'PAID',
          provider: 'zarinpal',
          amount: { amount: '250000', currency: 'IRR' },
          authority: 'AUTHORITY-1',
          referenceId: 'REF-1',
          outcome: 'VERIFIED',
          orderId: 'order-1',
          orderStatus: 'PAID',
          consumedReservations: 2,
          fulfillmentId: 'fulfillment-1',
        },
      },
    });

    expect(ctx.provider.verify).toHaveBeenCalledWith({
      amountMinorUnits: '250000',
      currency: 'IRR',
      authority: 'AUTHORITY-1',
      correlationId: 'req-1',
    });
    expect(ctx.inventory.consumeReservationsForOrder).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      { requestId: 'req-1' },
    );

    const transitions = ctx.tx.paymentTransition.create as ReturnType<typeof vi.fn>;
    const orderUpdates = ctx.tx.order.updateMany as ReturnType<typeof vi.fn>;
    expect(transitions).toHaveBeenCalledTimes(1);
    expect(transitions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentId: 'payment-1',
          from: 'PENDING',
          to: 'PAID',
          requestId: 'req-1',
          reason: 'GATEWAY_VERIFIED',
        }),
      }),
    );
    expect(orderUpdates).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'PENDING_PAYMENT' },
      data: { status: 'PAID' },
    });

    expect(ctx.tx.fulfillment.upsert).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      create: { orderId: 'order-1' },
      update: {},
    });
    expect(ctx.tx.fulfillmentTransition.createMany).toHaveBeenCalledWith({
      data: [{
        fulfillmentId: 'fulfillment-1',
        from: null,
        to: 'PENDING',
        reason: 'PAYMENT_VERIFIED',
        requestId: 'req-1',
      }],
      skipDuplicates: true,
    });
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'PAYMENT_VERIFIED',
          aggregateId: 'payment-1',
          deduplicationKey: 'payment-verified:payment-1',
          payload: expect.objectContaining({
            referenceId: 'REF-1',
            orderStatus: 'PAID',
            consumedReservations: 2,
            fulfillmentId: 'fulfillment-1',
          }),
        }),
      }),
    );

    expect(ctx.auditLog.record).toHaveBeenCalledTimes(2);
    const actions = (ctx.auditLog.record as ReturnType<typeof vi.fn>).mock.calls.map(
      ([record]) => (record as { action: string }).action,
    );
    expect(actions).toEqual(['payment.paid', 'order.paid']);
  });

  it('replays an already-settled payment without calling the gateway again', async () => {
    ctx = setup({
      entry: {
        ...paymentRow,
        status: 'PAID',
        referenceId: 'OLD-REF',
        order: { ...paymentRow.order, status: 'PAID' },
      },
    });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.provider.verify).not.toHaveBeenCalled();
    expect(ctx.tx.paymentTransition.create).not.toHaveBeenCalled();
    expect(ctx.tx.fulfillmentTransition.createMany).not.toHaveBeenCalled();
    expect(ctx.tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      data: {
        verification: {
          paymentId: 'payment-1',
          status: 'PAID',
          provider: 'zarinpal',
          amount: { amount: '250000', currency: 'IRR' },
          authority: 'AUTHORITY-1',
          referenceId: 'OLD-REF',
          outcome: 'REPLAY',
          orderId: 'order-1',
          orderStatus: 'PAID',
        },
      },
    });
  });

  it('replays a stale terminal callback without resurrecting the payment', async () => {
    ctx = setup({ entry: { ...paymentRow, status: 'FAILED', referenceId: null } });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.provider.verify).not.toHaveBeenCalled();
    expect(result.data.verification).toMatchObject({ status: 'FAILED', outcome: 'REPLAY' });
  });

  it('comes back clean when the settlement transaction re-reads an already PAID payment', async () => {
    ctx = setup({ settled: { ...paymentRow, status: 'PAID', referenceId: 'REF-ALREADY' } });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.tx.paymentTransition.create).not.toHaveBeenCalled();
    expect(ctx.tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(result.data.verification).toMatchObject({
      status: 'PAID',
      referenceId: 'REF-ALREADY',
      outcome: 'REPLAY',
    });
  });

  it('marks a NOK callback as NOT_PAID without contacting the gateway', async () => {
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'NOK',
      requestId: 'req-1',
    });
    expect(ctx.provider.verify).not.toHaveBeenCalled();
    const transitions = ctx.tx.paymentTransition.create as ReturnType<typeof vi.fn>;
    expect(transitions).toHaveBeenCalledOnce();
    expect(transitions).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          from: 'PENDING',
          to: 'FAILED',
          reason: 'gateway_not_paid',
          requestId: 'req-1',
        }),
      }),
    );
    expect(ctx.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.failed' }),
      expect.anything(),
    );
    expect(result.data.verification).toMatchObject({
      status: 'FAILED',
      outcome: 'NOT_PAID',
      orderStatus: 'PENDING_PAYMENT',
    });
  });

  it('records NOT_PAID when the provider deterministically reports no settlement', async () => {
    ctx = setup({ providerResult: { status: 'failed', reason: 'amount' } });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.tx.paymentTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ from: 'PENDING', to: 'FAILED' }),
      }),
    );
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledWith({
      data: {
        topic: 'PAYMENT_VERIFICATION_FAILED',
        aggregateType: 'payment',
        aggregateId: 'payment-1',
        deduplicationKey: 'payment-verification-failed:payment-1',
        payload: {
          paymentId: 'payment-1',
          orderId: 'order-1',
          provider: 'zarinpal',
          reason: expect.any(String),
          paymentStatus: 'FAILED',
        },
      },
    });
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(ctx.inventory.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(result.data.verification).toMatchObject({ outcome: 'NOT_PAID', status: 'FAILED' });
  });

  it('surfaces upstream unavailability and persists nothing', async () => {
    ctx = setup({ providerResult: { status: 'unavailable' } });
    await expect(
      ctx.service.verify({ authority: 'AUTHORITY-1', status: 'OK', requestId: 'req-1' }),
    ).rejects.toMatchObject({ response: { code: 'UPSTREAM_UNAVAILABLE' } });
    expect(ctx.tx.paymentTransition.create).not.toHaveBeenCalled();
    expect(ctx.tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(ctx.inventory.consumeReservationsForOrder).not.toHaveBeenCalled();
  });

  it('routes an ambiguous provider answer to reconciliation and keeps the payment PENDING', async () => {
    ctx = setup({ providerResult: { status: 'unknown_result' } });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.tx.paymentTransition.create).not.toHaveBeenCalled();
    expect(ctx.inventory.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'PAYMENT_VERIFICATION_UNCONFIRMED',
          aggregateId: 'payment-1',
          deduplicationKey: 'payment-verification-unconfirmed:payment-1',
        }),
      }),
    );
    expect(ctx.auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment.verification.unconfirmed' }),
      expect.anything(),
    );
    expect(result.data.verification).toMatchObject({
      status: 'PENDING',
      outcome: 'ACCEPTED_UNCONFIRMED',
    });
  });

  it('writes exactly one reconciliation record for repeated ambiguous callbacks', async () => {
    ctx = setup({ providerResult: { status: 'unknown_result' } });
    await ctx.service.verify({ authority: 'AUTHORITY-1', status: 'OK', requestId: 'req-1' });
    ctx.prisma.payment.findFirst = vi.fn(() =>
      Promise.resolve({ ...paymentRow, status: 'PENDING' }),
    ) as never;
    (ctx.tx.outboxEvent.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'outbox-1',
      deduplicationKey: 'payment-verification-unconfirmed:payment-1',
    });
    await ctx.service.verify({ authority: 'AUTHORITY-1', status: 'OK', requestId: 'req-2' });
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('settles a payment whose order was cancelled concurrently as reconciliation', async () => {
    ctx = setup({
      settled: {
        ...paymentRow,
        order: { ...paymentRow.order, status: 'CANCELLED', grandTotal: 250000n },
      },
    });
    const result = await ctx.service.verify({
      authority: 'AUTHORITY-1',
      status: 'OK',
      requestId: 'req-1',
    });
    expect(ctx.tx.paymentTransition.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ to: 'PAID', reason: 'GATEWAY_VERIFIED' }),
      }),
    );
    expect(ctx.tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'PAYMENT_VERIFIED_AFTER_CANCELLED',
          deduplicationKey: 'payment-verified-after-cancelled:payment-1',
        }),
      }),
    );
    expect(ctx.inventory.consumeReservationsForOrder).not.toHaveBeenCalled();
    expect(ctx.tx.fulfillment.upsert).not.toHaveBeenCalled();
    expect(result.data.verification).toMatchObject({
      status: 'PAID',
      outcome: 'VERIFIED_AFTER_CANCELLED',
      orderStatus: 'CANCELLED',
    });
  });

  it('rejects a settlement whose amount no longer matches the order total', async () => {
    ctx = setup({
      settled: {
        ...paymentRow,
        order: { ...paymentRow.order, grandTotal: 100000n },
      },
    });
    await expect(
      ctx.service.verify({ authority: 'AUTHORITY-1', status: 'OK', requestId: 'req-1' }),
    ).rejects.toMatchObject({ response: { code: 'PAYMENT_STATE_CONFLICT' } });
    expect(ctx.tx.outboxEvent.create).not.toHaveBeenCalled();
    expect(ctx.inventory.consumeReservationsForOrder).not.toHaveBeenCalled();
  });

  it('rejects a forged authority that matches no payment', async () => {
    ctx = setup({ entry: null });
    await expect(
      ctx.service.verify({ authority: 'FORGED', status: 'OK', requestId: 'req-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.provider.verify).not.toHaveBeenCalled();
  });

  it('rejects payments from a different gateway or environment', async () => {
    for (const entry of [
      { ...paymentRow, provider: 'other-gateway' },
      { ...paymentRow, gatewayEnvironment: 'live' },
    ]) {
      const attempt = setup({ entry: entry as never });
      await expect(
        attempt.service.verify({ authority: 'AUTHORITY-1', status: 'OK', requestId: 'req-1' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
      expect(attempt.provider.verify).not.toHaveBeenCalled();
    }
  });

  it('rejects invalid or missing callback parameters before any I/O', async () => {
    for (const authority of ['', '   ', 'x'.repeat(129)]) {
      const attempt = setup();
      await expect(
        attempt.service.verify({ authority, status: 'OK', requestId: 'req-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(attempt.provider.verify).not.toHaveBeenCalled();
      expect(attempt.prisma.payment.findFirst).not.toHaveBeenCalled();
    }
    await expect(
      ctx.service.verify({ authority: 'AUTHORITY-1', status: 'MAYBE', requestId: 'req-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
