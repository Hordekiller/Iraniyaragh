import { describe, expect, it, vi } from 'vitest';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AdminPaymentRefundService } from './admin-payment-refund.service';

type PaymentState = {
  id: string;
  status: string;
  amount: bigint;
  refundedAmount: bigint;
  orderId: string;
};

function setup(overrides: { payment?: PaymentState | null; refunds?: unknown[] } = {}) {
  const payment: PaymentState = (overrides.payment === undefined
    ? {
        id: 'payment-1',
        status: 'PAID',
        amount: 100_000n,
        refundedAmount: 0n,
        orderId: 'order-1',
      }
    : overrides.payment) as PaymentState;
  const refunds = [...(overrides.refunds ?? [])];
  const transitions: unknown[] = [];
  const outbox: unknown[] = [];

  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    payment: {
      findUnique: vi.fn().mockResolvedValue(payment),
      update: vi.fn().mockImplementation(async ({ data }: { data: Partial<PaymentState> }) => {
        // The database check constraint is the backstop for the cap.
        if (
          data.refundedAmount !== undefined &&
          (data.refundedAmount < 0n || data.refundedAmount > payment.amount)
        ) {
          throw new Error('Payment_refundedAmount_within_amount');
        }
        Object.assign(payment, data);
        return payment;
      }),
      // `recordTransition` performs the status compare-and-set itself.
      updateMany: vi.fn().mockImplementation(async ({ data }: { data: { status: string } }) => {
        payment.status = data.status as PaymentState['status'];
        return { count: 1 };
      }),
    },
    refund: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
        const found = refunds.find(
          (r) => (r as { idempotencyKey: string }).idempotencyKey === where.idempotencyKey,
        ) as Record<string, unknown> | undefined;
        // The service reads the related payment on replay.
        return found ? { ...found, payment: { ...payment } } : null;
      }),
      create: vi.fn().mockImplementation(async ({ data, select }: { data: Record<string, unknown>; select: Record<string, boolean> }) => {
        const created = { id: 'refund-1', createdAt: new Date('2026-09-25T10:00:00.000Z'), ...data };
        refunds.push(created);
        return Object.fromEntries(
          Object.entries(created).filter(([key]) => select[key] === true),
        );
      }),
    },
    paymentTransition: { create: vi.fn().mockResolvedValue({ id: 'transition-1' }) },
    outboxEvent: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        outbox.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new AdminPaymentRefundService(prisma as never, audit as never);
  return { service, tx, payment, refunds, transitions, outbox, audit };
}

const request = (overrides: Partial<Parameters<AdminPaymentRefundService['record']>[0]> = {}) => ({
  paymentId: 'payment-1',
  actorId: 'staff-1',
  requestId: 'req-1',
  idempotencyKey: 'key-1',
  amountMinorUnits: '40000',
  gatewayReferenceId: 'ZR-REF-1',
  reason: 'CANCELLED_SHIPMENT',
  ...overrides,
});

const paymentRefundedAmount = (payment: PaymentState): bigint => payment.refundedAmount;

describe('AdminPaymentRefundService', () => {
  it('records a partial refund and moves the payment to PARTIALLY_REFUNDED', async () => {
    const ctx = setup();
    const { data } = await ctx.service.record(request());

    expect(data.refund).toMatchObject({
      refundId: 'refund-1',
      paymentId: 'payment-1',
      orderId: 'order-1',
      amount: { amount: '40000', currency: 'IRR' },
      status: 'RECORDED',
      gatewayReferenceId: 'ZR-REF-1',
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundedTotal: { amount: '40000' },
      remainingRefundable: { amount: '60000' },
    });
    expect(ctx.payment.status).toBe('PARTIALLY_REFUNDED');
    expect(ctx.payment.refundedAmount).toBe(40_000n);
    expect(ctx.tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PARTIALLY_REFUNDED' } }),
    );
  });

  it('keeps the status and writes no self-transition for a further partial refund', async () => {
    const ctx = setup({
      payment: { id: 'payment-1', status: 'PARTIALLY_REFUNDED', amount: 100_000n, refundedAmount: 40_000n, orderId: 'order-1' },
    });
    const { data } = await ctx.service.record(request({ amountMinorUnits: '20000' }));

    expect(data.refund.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(data.refund.refundedTotal).toEqual({ amount: '60000', currency: 'IRR' });
    // The shared state machine rejects a self-transition, so an unchanged status
    // must not be rewritten; the refund row and the audit row still record it.
    expect(ctx.transitions).toHaveLength(0);
    expect(ctx.tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { refundedAmount: 60_000n } }),
    );
    expect(paymentRefundedAmount(ctx.payment)).toBe(60_000n);
  });

  it('moves the payment to REFUNDED when the remainder is returned', async () => {
    const ctx = setup({
      payment: { id: 'payment-1', status: 'PARTIALLY_REFUNDED', amount: 100_000n, refundedAmount: 40_000n, orderId: 'order-1' },
    });
    const { data } = await ctx.service.record(request({ amountMinorUnits: '60000' }));

    expect(data.refund.paymentStatus).toBe('REFUNDED');
    expect(data.refund.remainingRefundable).toEqual({ amount: '0', currency: 'IRR' });
  });

  it('audits the staff action inside the money transaction', async () => {
    const ctx = setup();
    await ctx.service.record(request());

    expect(ctx.audit.record).toHaveBeenCalledOnce();
    const [event, client] = ctx.audit.record.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(event).toMatchObject({
      action: 'payment.refund.recorded',
      entityType: 'payment',
      entityId: 'payment-1',
      actorId: 'staff-1',
      requestId: 'req-1',
      before: { status: 'PAID', refundedTotal: '0' },
      after: { status: 'PARTIALLY_REFUNDED', refundedTotal: '40000' },
    });
    expect(client).toBe(ctx.tx);
  });

  it('does not audit a replay as a second staff action', async () => {
    const ctx = setup();
    await ctx.service.record(request());
    await ctx.service.record(request());
    expect(ctx.audit.record).toHaveBeenCalledOnce();
  });

  it('emits one deduplicated refund event with no gateway authority or secrets', async () => {
    const ctx = setup();
    await ctx.service.record(request());

    expect(ctx.outbox).toHaveLength(1);
    const event = ctx.outbox[0] as Record<string, unknown>;
    expect(event.topic).toBe('PAYMENT_REFUNDED');
    expect(event.aggregateType).toBe('payment');
    expect(event.aggregateId).toBe('payment-1');
    expect(event.deduplicationKey).toBe('payment-refunded:refund-1');
    const payload = event.payload as Record<string, unknown>;
    expect(payload).toMatchObject({ refundId: 'refund-1', amount: '40000', currency: 'IRR' });
    expect(JSON.stringify(payload)).not.toContain('authority');
    expect(JSON.stringify(payload)).not.toContain('idempotency');
  });

  it('takes the order advisory lock every payment money transition uses', async () => {
    const ctx = setup();
    await ctx.service.record(request());
    expect(ctx.tx.$executeRaw).toHaveBeenCalledOnce();
    // The lock is taken before the payment is re-read inside it, so no decision
    // is made from a row that predates a concurrent money movement.
    const lockOrder = ctx.tx.$executeRaw.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(ctx.tx.payment.findUnique.mock.invocationCallOrder[1] as number);
  });

  it('records the initiating staff actor and request on the evidence row', async () => {
    const ctx = setup();
    await ctx.service.record(request());
    const row = ctx.refunds[0] as Record<string, unknown>;
    expect(row.actorId).toBe('staff-1');
    expect(row.requestId).toBe('req-1');
    expect(row.idempotencyKey).toMatch(/^[0-9a-f]{64}$/u);
    expect(row.idempotencyFingerprint).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('replays the stored refund for the same key and payload without a second record', async () => {
    const ctx = setup();
    const first = await ctx.service.record(request());
    const replay = await ctx.service.record(request({ requestId: 'req-2' }));

    expect(replay.data.refund.refundId).toBe(first.data.refund.refundId);
    expect(ctx.refunds).toHaveLength(1);
    expect(ctx.tx.refund.create).toHaveBeenCalledOnce();
  });

  it('refuses a changed payload under the same key', async () => {
    const ctx = setup();
    await ctx.service.record(request());
    await expect(
      ctx.service.record(request({ amountMinorUnits: '50000' })),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.refunds).toHaveLength(1);
  });

  it('refuses to refund a payment that was never settled', async () => {
    const ctx = setup({
      payment: { id: 'payment-1', status: 'PENDING', amount: 100_000n, refundedAmount: 0n, orderId: 'order-1' },
    });
    await expect(ctx.service.record(request())).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.tx.refund.create).not.toHaveBeenCalled();
  });

  it('refuses a second refund of a fully refunded payment', async () => {
    const ctx = setup({
      payment: { id: 'payment-1', status: 'REFUNDED', amount: 100_000n, refundedAmount: 100_000n, orderId: 'order-1' },
    });
    await expect(ctx.service.record(request())).rejects.toMatchObject({
      response: { code: 'PAYMENT_STATE_CONFLICT' },
    });
  });

  it('refuses more money than the payment captured', async () => {
    const ctx = setup();
    await expect(
      ctx.service.record(request({ amountMinorUnits: '100001' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ctx.tx.refund.create).not.toHaveBeenCalled();
  });

  it('refuses an amount that would push the running total past the captured money', async () => {
    const ctx = setup({
      payment: { id: 'payment-1', status: 'PARTIALLY_REFUNDED', amount: 100_000n, refundedAmount: 99_000n, orderId: 'order-1' },
    });
    await expect(
      ctx.service.record(request({ amountMinorUnits: '2000' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(ctx.tx.refund.create).not.toHaveBeenCalled();
    expect(paymentRefundedAmount(ctx.payment)).toBe(99_000n);
  });

  it('accepts a multi-word reason and keeps it verbatim in the evidence', async () => {
    const ctx = setup();
    const { data } = await ctx.service.record(
      request({ reason: 'Customer refused delivery', note: 'Call logged: agent 42' }),
    );
    expect(data.refund.reason).toBe('Customer refused delivery');
    expect(data.refund.note).toBe('Call logged: agent 42');
  });

  it('refuses a refund without gateway evidence', async () => {
    const ctx = setup();
    for (const gatewayReferenceId of ['', ' padded ']) {
      await expect(
        ctx.service.record(request({ gatewayReferenceId })),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    expect(ctx.tx.refund.create).not.toHaveBeenCalled();
  });

  it('refuses a non-integer or zero amount', async () => {
    const ctx = setup();
    for (const amountMinorUnits of ['0', '-1', '1.5', 'abc', '1000 ', '']) {
      await expect(
        ctx.service.record(request({ amountMinorUnits })),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
  });

  it('refuses evidence that contains control characters', async () => {
    const ctx = setup();
    await expect(
      ctx.service.record(request({ gatewayReferenceId: 'ZR REF' })),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('reports a missing payment without writing anything', async () => {
    const ctx = setup({ payment: null });
    await expect(ctx.service.record(request())).rejects.toBeInstanceOf(NotFoundException);
    expect(ctx.tx.refund.create).not.toHaveBeenCalled();
  });
});
