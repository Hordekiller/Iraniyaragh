import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { PaymentInitiationService } from './payment-initiation.service';
import type { PaymentAuthorizeResult, PaymentGatewayConfig, PaymentProvider } from './payment-provider.port';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function initiationFingerprint(orderId: string): string {
  return hash(JSON.stringify({ scope: 'payment.initiation', orderId, provider: 'zarinpal' }));
}

const gatewayConfig: PaymentGatewayConfig = {
  providerName: 'zarinpal',
  mode: 'sandbox',
  callbackUrl: 'http://localhost:4321/api/v1/payments/zarinpal/callback',
  timeoutMs: 100,
};

const orderRow = {
  id: 'order-1',
  number: 'ORD-001',
  customerId: 'customer-1',
  status: 'PENDING_PAYMENT',
  grandTotal: 250000n,
};

type PaymentRow = {
  id: string;
  status: string;
  authority: string | null;
  idempotencyFingerprint: string;
  orderId: string;
  gatewayEnvironment: string;
};

function paymentRow(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: 'payment-1',
    status: 'PENDING',
    authority: null,
    idempotencyFingerprint: initiationFingerprint('order-1'),
    orderId: 'order-1',
    gatewayEnvironment: 'sandbox',
    ...overrides,
  };
}

function setup(overrides: {
  customer?: { id: string } | null;
  order?: typeof orderRow | null;
  existing?: PaymentRow | null;
  active?: PaymentRow | null;
  authorizeResult?: PaymentAuthorizeResult;
  paymentFindUniqueStatus?: string | null;
} = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    customer: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.customer === undefined ? { id: 'customer-1' } : overrides.customer),
    },
    order: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.order === undefined ? orderRow : overrides.order),
    },
    payment: {
      findUnique: vi.fn((args: { where: { id?: string; idempotencyKey?: string } }) => {
        if (args.where.id !== undefined) {
          return Promise.resolve(
            overrides.paymentFindUniqueStatus === null ? null : paymentRow({ status: overrides.paymentFindUniqueStatus ?? 'PENDING' }),
          );
        }
        return Promise.resolve(overrides.existing ?? null);
      }),
      findFirst: vi.fn().mockResolvedValue(overrides.active ?? null),
      create: vi.fn().mockResolvedValue(paymentRow({ id: 'payment-new' })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    paymentTransition: { create: vi.fn().mockResolvedValue({ id: 'transition-1' }) },
  };
  const provider = {
    providerName: 'zarinpal',
    authorize: vi.fn().mockResolvedValue(
      overrides.authorizeResult ?? {
        status: 'redirect',
        authority: 'AUTHORITY-1',
        redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/AUTHORITY-1',
      },
    ),
  } as PaymentProvider & { authorize: ReturnType<typeof vi.fn> };
  const prisma = {
    payment: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    customer: { findUnique: vi.fn().mockResolvedValue({ id: 'customer-1' }) },
    $transaction: vi.fn().mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => fn(tx as never)),
  } as never;
  const service = new PaymentInitiationService(prisma as never, provider as never, gatewayConfig);
  return {
    tx: tx as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
    prisma: prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>,
    provider,
    service,
  };
}

describe('PaymentInitiationService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it("authorizes with the order's grand total and returns a vendor-neutral initiation", async () => {
    const result = await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(ctx.provider.authorize).toHaveBeenCalledOnce();
    expect(ctx.provider.authorize).toHaveBeenCalledWith({
      orderId: 'order-1',
      orderNumber: 'ORD-001',
      amountMinorUnits: '250000',
      currency: 'IRR',
      callbackUrl: gatewayConfig.callbackUrl,
      correlationId: 'req-1',
    });
    expect(result).toEqual({
      data: {
        payment: {
          paymentId: 'payment-new',
          status: 'PENDING',
          provider: 'zarinpal',
          amount: { amount: '250000', currency: 'IRR' },
          authority: 'AUTHORITY-1',
          redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/AUTHORITY-1',
        },
      },
    });

    const payment = ctx.tx.payment;
    expect(payment.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        provider: 'zarinpal',
        amount: 250000n,
        status: 'PENDING',
        idempotencyKey: hash('key-1'),
        idempotencyFingerprint: initiationFingerprint('order-1'),
        correlationId: 'req-1',
        gatewayEnvironment: 'sandbox',
      },
    });
  });

  it('registers the payment attempt before any provider call', async () => {
    const order: Array<'create' | 'authorize'> = [];
    const tx = ctx.tx;
    (tx.payment.create as ReturnType<typeof vi.fn>).mockImplementation(() => {
      order.push('create');
      return Promise.resolve(paymentRow({ id: 'payment-new' }));
    });
    ctx.provider.authorize.mockImplementation(() => {
      order.push('authorize');
      return Promise.resolve({
        status: 'redirect',
        authority: 'A',
        redirectUrl: 'https://sandbox.zarinpal.com/pg/StartPay/A',
      });
    });

    await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(order).toEqual(['create', 'authorize']);
  });

  it('replays the same key with the same outcome without calling the gateway again', async () => {
    const existing = paymentRow({ authority: 'AUTHORITY-1' });
    ctx = setup({ existing });
    const result = await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });
    expect(ctx.provider.authorize).not.toHaveBeenCalled();
    expect(result.data.payment.authority).toBe('AUTHORITY-1');
  });

  it('rejects a replay that changed its payload binding', async () => {
    ctx = setup({ existing: paymentRow({ idempotencyFingerprint: 'f'.repeat(64) }) });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_CONFLICT' },
    });
  });

  it('rejects a replay of a terminal attempt with the same key', async () => {
    ctx = setup({ existing: paymentRow({ status: 'FAILED', authority: 'OLD' }) });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'PAYMENT_STATE_CONFLICT' },
    });
  });

  it('replays the single active pending payment even with a different key', async () => {
    ctx = setup({ active: paymentRow({ id: 'payment-live', authority: 'ACTIVE-AUTHORITY' }) });
    const result = await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-2',
      requestId: 'req-2',
    });
    expect(ctx.provider.authorize).not.toHaveBeenCalled();
    expect(result.data.payment.paymentId).toBe('payment-live');
    expect(result.data.payment.authority).toBe('ACTIVE-AUTHORITY');
  });

  it('recovers a committed-but-not-authorized attempt against the same row', async () => {
    ctx = setup({ existing: paymentRow({ id: 'payment-crashed' }) });
    const result = await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });
    expect(ctx.provider.authorize).toHaveBeenCalledOnce();
    expect(ctx.provider.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNumber: 'ORD-001',
        amountMinorUnits: '250000',
      }),
    );
    expect(result.data.payment.paymentId).toBe('payment-crashed');
  });

  it('does not allow initiating payment for a foreign order', async () => {
    ctx = setup({ order: { ...orderRow, customerId: 'customer-other' } });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ORDER_NOT_FOUND' },
    });
    expect(ctx.provider.authorize).not.toHaveBeenCalled();
  });

  it('rejects initiation for an order that is no longer pending payment', async () => {
    ctx = setup({ order: { ...orderRow, status: 'PAID' } });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'ORDER_STATE_CONFLICT' },
    });
  });

  it('requires a linked customer profile', async () => {
    ctx = setup({ customer: null });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CONFLICT' },
    });
  });

  it.each([
    [
      { status: 'rejected', reason: 'invalid_request' } as const,
      'gateway_rejected',
      UnprocessableEntityException,
      'UNPROCESSABLE',
      422,
    ],
    [
      { status: 'unavailable' } as const,
      'gateway_unavailable',
      ServiceUnavailableException,
      'UPSTREAM_UNAVAILABLE',
      503,
    ],
    [
      { status: 'unknown_result' } as const,
      'gateway_unconfirmed',
      ServiceUnavailableException,
      'PAYMENT_RESULT_UNCONFIRMED',
      503,
    ],
  ])(
    'records %s as a failed attempt with an explicit transition',
    async (authorizeResult, reason, exceptionClass, code, status) => {
      ctx = setup({ authorizeResult });
      const invocation = () =>
        ctx.service.initiate({
          userId: 'user-1',
          orderId: 'order-1',
          idempotencyKey: 'key-1',
          requestId: 'req-1',
        });

      let error: unknown;
      try {
        await invocation();
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(exceptionClass);
      expect(error).toMatchObject({ response: { code } });
      expect((error as { getStatus: () => number }).getStatus()).toBe(status);
      expect(ctx.provider.authorize).toHaveBeenCalledOnce();
      const transition = ctx.tx.paymentTransition;
      expect(transition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            paymentId: 'payment-new',
            from: 'PENDING',
            to: 'FAILED',
            requestId: 'req-1',
            reason,
          }),
        }),
      );
    },
  );

  it('never auto-retries an ambiguous gateway outcome', async () => {
    ctx = setup({ authorizeResult: { status: 'unknown_result' } });
    const attempt = () =>
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      });
    await expect(attempt()).rejects.toMatchObject({
      response: { code: 'PAYMENT_RESULT_UNCONFIRMED' },
    });
    expect(ctx.provider.authorize).toHaveBeenCalledOnce();
  });

  it('fails closed when the order moves on while the gateway call is in flight', async () => {
    ctx = setup({ authorizeResult: { status: 'redirect', authority: 'A', redirectUrl: 'R' } });
    (ctx.prisma.payment as Record<string, ReturnType<typeof vi.fn>>).updateMany.mockResolvedValue({
      count: 0,
    });
    (ctx.prisma.payment as Record<string, ReturnType<typeof vi.fn>>).findUnique.mockResolvedValue({
      status: 'FAILED',
      authority: null,
      amount: 1000n,
      gatewayEnvironment: 'sandbox',
    });
    await expect(
      ctx.service.initiate({
        userId: 'user-1',
        orderId: 'order-1',
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays the authority a concurrent initiation already claimed', async () => {
    ctx = setup({ authorizeResult: { status: 'redirect', authority: 'LOSER', redirectUrl: 'R' } });
    (ctx.prisma.payment as Record<string, ReturnType<typeof vi.fn>>).updateMany.mockResolvedValue({
      count: 0,
    });
    (ctx.prisma.payment as Record<string, ReturnType<typeof vi.fn>>).findUnique.mockResolvedValue({
      status: 'PENDING',
      authority: 'WINNER',
      amount: 1000n,
      gatewayEnvironment: 'sandbox',
    });

    const result = await ctx.service.initiate({
      userId: 'user-1',
      orderId: 'order-1',
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(result.data.payment.authority).toBe('WINNER');
    expect(JSON.stringify(result)).not.toContain('LOSER');
  });
});