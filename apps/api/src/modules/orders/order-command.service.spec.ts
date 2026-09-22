import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderCommandService } from './order-command.service';

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function customerFingerprint(actorId: string): string {
  return hash(JSON.stringify({ actorId, reason: 'CUSTOMER_CANCELLED' }));
}

function staffFingerprint(actorId: string): string {
  return hash(JSON.stringify({ actorId, reason: 'STAFF_CANCELLED' }));
}

const pendingOrder = {
  id: 'order-1',
  number: 'ORD-001',
  customerId: 'customer-1',
  status: 'PENDING_PAYMENT',
};

function setup(overrides: {
  prior?: {
    fingerprint?: string;
    responseJson?: unknown;
  } | null;
  order?: typeof pendingOrder | null;
  customer?: { id: string } | null;
  candidates?: Array<{ id: string }>;
  reservationsToRelease?: number;
} = {}) {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    orderCommandIdempotencyRecord: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue(overrides.prior ?? null),
      create: vi.fn().mockResolvedValue({ id: 'claim-1', expiresAt: new Date() }),
      update: vi.fn().mockResolvedValue({ id: 'claim-1' }),
    },
    order: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.order === undefined ? pendingOrder : overrides.order),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue(overrides.candidates ?? []),
    },
    orderTransition: {
      create: vi.fn().mockResolvedValue({ id: 'transition-1' }),
    },
    outboxEvent: { create: vi.fn().mockResolvedValue({ id: 'outbox-1' }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 'audit-1' }) },
  };
  const prisma = {
    customer: {
      findUnique: vi
        .fn()
        .mockResolvedValue(overrides.customer === undefined ? { id: 'customer-1' } : overrides.customer),
    },
    order: {
      findMany: vi.fn().mockResolvedValue(overrides.candidates ?? []),
    },
    $transaction: vi.fn().mockImplementation(async (fn: (client: unknown) => Promise<unknown>) =>
      fn(tx as never),
    ),
  } as never;
  const audit = { record: vi.fn().mockResolvedValue({ id: 'audit-1' }) } as never;
  const inventory = {
    releaseReservationsForOrder: vi
      .fn()
      .mockResolvedValue(overrides.reservationsToRelease ?? 2),
  } as never;
  const service = new OrderCommandService(
    prisma as never,
    audit as never,
    inventory as never,
  );
  return {
    tx: tx as unknown as Record<string, Record<string, unknown>>,
    prisma: prisma as unknown as Record<string, Record<string, unknown>>,
    audit,
    inventory: inventory as Record<string, Record<string, unknown>>,
    service,
  };
}

describe('OrderCommandService', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('cancels an owned pending-payment order and compensates its reservations', async () => {
    const result = await ctx.service.cancelAsCustomer('user-1', 'order-1', {
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(result).toMatchObject({
      data: {
        order: {
          id: 'order-1',
          number: 'ORD-001',
          status: 'CANCELLED',
          releasedReservations: 2,
          cancelledAt: expect.any(String),
        },
      },
    });

    const claims = ctx.tx.orderCommandIdempotencyRecord as Record<string, ReturnType<typeof vi.fn>>;
    expect(claims.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        scope: 'order.cancel:customer',
        keyHash: hash('key-1'),
        fingerprint: customerFingerprint('user-1'),
        expiresAt: expect.any(Date),
      },
    });

    const transitions = ctx.tx.orderTransition as Record<string, ReturnType<typeof vi.fn>>;
    expect(transitions.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        from: 'PENDING_PAYMENT',
        to: 'CANCELLED',
        actorId: 'user-1',
        requestId: 'req-1',
        reason: 'CUSTOMER_CANCELLED',
      },
    });

    expect(ctx.inventory.releaseReservationsForOrder).toHaveBeenCalledWith(
      ctx.tx,
      'order-1',
      { actorId: 'user-1', requestId: 'req-1' },
    );

    const outbox = ctx.tx.outboxEvent as Record<string, ReturnType<typeof vi.fn>>;
    expect(outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'ORDER_CANCELLED',
          aggregateId: 'order-1',
          deduplicationKey: 'order-cancelled:order-1',
        }),
      }),
    );

    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'order.cancelled', actorId: 'user-1', requestId: 'req-1' }),
      ctx.tx,
    );

    expect(claims.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'claim-1' },
        data: expect.objectContaining({ responseJson: result.data.order }),
      }),
    );
  });

  it('lets staff cancel any pending-payment order without coupling to a customer profile', async () => {
    ctx = setup({ order: { ...pendingOrder, customerId: 'customer-2' } });

    const result = await ctx.service.cancelAsStaff('staff-1', 'order-1', {
      idempotencyKey: 'key-staff',
      requestId: 'req-staff',
    });

    expect(result.data.order.status).toBe('CANCELLED');
    expect(ctx.prisma.customer.findUnique).not.toHaveBeenCalled();
    const claims = ctx.tx.orderCommandIdempotencyRecord as Record<string, ReturnType<typeof vi.fn>>;
    expect(claims.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scope: 'order.cancel:staff' }),
      }),
    );
    const transitions = ctx.tx.orderTransition as Record<string, ReturnType<typeof vi.fn>>;
    expect(transitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: 'STAFF_CANCELLED' }),
      }),
    );
  });

  it('replays the cached response for a matching retry and touches nothing', async () => {
    const stored = {
      id: 'order-1',
      number: 'ORD-001',
      status: 'CANCELLED',
      releasedReservations: 2,
      cancelledAt: '2026-09-22T00:00:00.000Z',
    };
    ctx = setup({
      prior: { fingerprint: customerFingerprint('user-1'), responseJson: stored },
    });

    const result = await ctx.service.cancelAsCustomer('user-1', 'order-1', {
      idempotencyKey: 'key-1',
      requestId: 'req-1',
    });

    expect(result).toEqual({ data: { order: stored } });
    const claims = ctx.tx.orderCommandIdempotencyRecord as Record<string, ReturnType<typeof vi.fn>>;
    expect(claims.create).not.toHaveBeenCalled();
    expect(ctx.inventory.releaseReservationsForOrder).not.toHaveBeenCalled();
    expect(ctx.audit.record).not.toHaveBeenCalled();
  });

  it('rejects reusing an idempotency key with a different payload', async () => {
    ctx = setup({
      prior: { fingerprint: staffFingerprint('staff-1'), responseJson: undefined },
    });

    await expect(
      ctx.service.cancelAsCustomer('user-1', 'order-1', {
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });

  it('keeps customer and staff scopes independent', async () => {
    const first = await ctx.service.cancelAsCustomer('user-1', 'order-1', {
      idempotencyKey: 'shared-key',
      requestId: 'req-1',
    });
    const second = await ctx.service.cancelAsStaff('staff-1', 'order-1', {
      idempotencyKey: 'shared-key',
      requestId: 'req-2',
    });

    expect(first.data.order.status).toBe('CANCELLED');
    expect(second.data.order.status).toBe('CANCELLED');
    const claims = ctx.tx.orderCommandIdempotencyRecord as Record<string, ReturnType<typeof vi.fn>>;
    const createdScopes = claims.create.mock.calls.map(
      (call) => (call[0] as { data: { scope: string } }).data.scope,
    );
    expect(createdScopes).toEqual(['order.cancel:customer', 'order.cancel:staff']);
    const transitions = ctx.tx.orderTransition as Record<string, ReturnType<typeof vi.fn>>;
    expect(transitions.create).toHaveBeenCalledTimes(2);
    expect(ctx.inventory.releaseReservationsForOrder).toHaveBeenCalledTimes(2);
  });

  it('rejects cancellation of an order that is no longer pending payment', async () => {
    ctx = setup({ order: { ...pendingOrder, status: 'PAID' } });

    await expect(
      ctx.service.cancelAsCustomer('user-1', 'order-1', {
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_STATE_CONFLICT' } });
  });

  it('does not leak a foreign order through an ownership 404', async () => {
    ctx = setup({ order: { ...pendingOrder, customerId: 'customer-2' } });

    await expect(
      ctx.service.cancelAsCustomer('user-1', 'order-1', {
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });
    expect(ctx.inventory.releaseReservationsForOrder).not.toHaveBeenCalled();
  });

  it('returns a 404 when the order does not exist', async () => {
    ctx = setup({ order: null });

    await expect(
      ctx.service.cancelAsCustomer('user-1', 'order-1', {
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'ORDER_NOT_FOUND' } });
  });

  it('rejects cancellation when no customer profile is linked', async () => {
    ctx = setup({ customer: null });

    await expect(
      ctx.service.cancelAsCustomer('user-1', 'order-1', {
        idempotencyKey: 'key-1',
        requestId: 'req-1',
      }),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(ctx.inventory.releaseReservationsForOrder).not.toHaveBeenCalled();
  });

  it('expires overdue pending orders and compensates their reservations', async () => {
    ctx = setup({
      order: { ...pendingOrder, id: 'order-expired' },
      candidates: [{ id: 'order-expired' }],
    });

    const result = await ctx.service.expirePendingPaymentOrders(
      { actorId: 'staff-1', requestId: 'exp-1' },
      { now: new Date('2026-09-22T00:00:00.000Z') },
    );

    expect(result).toEqual({ data: { expired: 1 } });
    const transitions = ctx.tx.orderTransition as Record<string, ReturnType<typeof vi.fn>>;
    expect(transitions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-expired',
          from: 'PENDING_PAYMENT',
          to: 'CANCELLED',
          reason: 'RESERVATION_EXPIRED',
          requestId: 'exp-1:order-expired',
        }),
      }),
    );
    expect(ctx.inventory.releaseReservationsForOrder).toHaveBeenCalledWith(
      ctx.tx,
      'order-expired',
      { actorId: 'staff-1', requestId: 'exp-1' },
    );
    const outbox = ctx.tx.outboxEvent as Record<string, ReturnType<typeof vi.fn>>;
    expect(outbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: 'ORDER_EXPIRED',
          deduplicationKey: 'order-expired:order-expired',
        }),
      }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'order.expired', requestId: 'exp-1:order-expired' }),
      ctx.tx,
    );
  });

  it('skips orders that a concurrent cancel already moved out of the window', async () => {
    ctx = setup({
      order: { ...pendingOrder, id: 'order-raced', status: 'CANCELLED' },
      candidates: [{ id: 'order-raced' }],
    });

    const result = await ctx.service.expirePendingPaymentOrders(
      { actorId: 'staff-1', requestId: 'exp-2' },
      { now: new Date('2026-09-22T00:00:00.000Z') },
    );

    expect(result).toEqual({ data: { expired: 0 } });
    const outbox = ctx.tx.outboxEvent as Record<string, ReturnType<typeof vi.fn>>;
    expect(outbox.create).not.toHaveBeenCalled();
    expect(ctx.inventory.releaseReservationsForOrder).not.toHaveBeenCalled();
  });

  it('requires a tracked actor and request context', async () => {
    ctx = setup({ candidates: [{ id: 'order-expired' }] });

    await expect(
      ctx.service.expirePendingPaymentOrders({ actorId: '', requestId: 'exp-1' }),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(ctx.prisma.order.findMany).not.toHaveBeenCalled();
  });
});