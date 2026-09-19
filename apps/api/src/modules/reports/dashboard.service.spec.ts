import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardService } from './dashboard.service';

const emptyAggregate = { _count: { _all: 0 }, _sum: { grandTotal: null } };

function buildService() {
  const prisma = {
    order: {
      aggregate: vi.fn().mockResolvedValue(emptyAggregate),
      groupBy: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    payment: { groupBy: vi.fn().mockResolvedValue([]) },
    fulfillment: { groupBy: vi.fn().mockResolvedValue([]) },
    inventoryBalance: { count: vi.fn().mockResolvedValue(0) },
    stockReservation: { groupBy: vi.fn().mockResolvedValue([]) },
    stockTransfer: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
  };

  return {
    prisma,
    service: new DashboardService(prisma as never),
  };
}

describe('DashboardService', () => {
  let ctx: ReturnType<typeof buildService>;

  beforeEach(() => {
    ctx = buildService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T08:30:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns an explicit all-zero snapshot when the database has no matching facts', async () => {
    const response = await ctx.service.getSummary({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-09-08T00:00:00.000Z',
    });

    expect(response.data.summary).toMatchObject({
      generatedAt: '2026-09-19T08:30:00.000Z',
      presentationTimezone: 'Asia/Tehran',
      rangeMetrics: {
        ordersCreated: 0,
        grossOrderValue: { amount: '0', currency: 'IRR' },
      },
      commerceSnapshot: {
        ordersWithoutPaymentAttempts: 0,
        ordersWithoutFulfillment: 0,
      },
      inventorySnapshot: {
        zeroAvailableBalances: 0,
        activeReservations: 0,
      },
    });

    for (const collection of [
      response.data.summary.commerceSnapshot.ordersByStatus,
      response.data.summary.commerceSnapshot.paymentAttemptsByStatus,
      response.data.summary.commerceSnapshot.fulfillmentsByStatus,
      response.data.summary.inventorySnapshot.reservationsByStatus,
      response.data.summary.inventorySnapshot.transfersByStatus,
    ]) {
      expect(collection.length).toBeGreaterThan(0);
      expect(collection.every(({ count }) => count === 0)).toBe(true);
    }
  });

  it('maps database aggregates without guessing business thresholds or dropping zero statuses', async () => {
    ctx.prisma.order.aggregate.mockResolvedValue({
      _count: { _all: 7 },
      _sum: { grandTotal: 98_765_432_100n },
    });
    ctx.prisma.order.groupBy.mockResolvedValue([
      { status: 'PAID', _count: { _all: 4 } },
      { status: 'CANCELLED', _count: { _all: 1 } },
    ]);
    ctx.prisma.payment.groupBy.mockResolvedValue([
      { status: 'PAID', _count: { _all: 5 } },
      { status: 'FAILED', _count: { _all: 2 } },
    ]);
    ctx.prisma.fulfillment.groupBy.mockResolvedValue([
      { status: 'PROCESSING', _count: { _all: 3 } },
    ]);
    ctx.prisma.order.count.mockResolvedValueOnce(2).mockResolvedValueOnce(6);
    ctx.prisma.inventoryBalance.count.mockResolvedValue(11);
    ctx.prisma.stockReservation.groupBy.mockResolvedValue([
      { status: 'ACTIVE', _count: { _all: 8 } },
      { status: 'CONSUMED', _count: { _all: 13 } },
    ]);
    ctx.prisma.stockTransfer.groupBy.mockResolvedValue([
      { status: 'IN_TRANSIT', _count: { _all: 2 } },
    ]);

    const response = await ctx.service.getSummary({
      createdFrom: '2026-09-01T00:00:00+03:30',
      createdToExclusive: '2026-09-08T00:00:00+03:30',
    });
    const summary = response.data.summary;

    expect(summary.range).toEqual({
      createdFrom: '2026-08-31T20:30:00.000Z',
      createdToExclusive: '2026-09-07T20:30:00.000Z',
    });
    expect(summary.rangeMetrics).toEqual({
      ordersCreated: 7,
      grossOrderValue: { amount: '98765432100', currency: 'IRR' },
    });
    expect(summary.commerceSnapshot.ordersByStatus).toEqual(
      expect.arrayContaining([
        { status: 'PAID', count: 4 },
        { status: 'CANCELLED', count: 1 },
        { status: 'DRAFT', count: 0 },
      ]),
    );
    expect(summary.commerceSnapshot).toMatchObject({
      ordersWithoutPaymentAttempts: 2,
      ordersWithoutFulfillment: 6,
    });
    expect(summary.inventorySnapshot).toMatchObject({
      zeroAvailableBalances: 11,
      activeReservations: 8,
    });
  });

  it('uses one repeatable-read transaction with a fixed budget of nine aggregate operations', async () => {
    await ctx.service.getSummary({
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-09-08T00:00:00.000Z',
    });

    expect(ctx.prisma.$transaction).toHaveBeenCalledOnce();
    const [operations, options] = ctx.prisma.$transaction.mock.calls[0] ?? [];
    expect(operations).toHaveLength(9);
    expect(options).toEqual({
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
    expect(ctx.prisma.order.aggregate).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: new Date('2026-09-01T00:00:00.000Z'),
          lt: new Date('2026-09-08T00:00:00.000Z'),
        },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
    });
  });

  it.each([
    {
      label: 'an equal boundary',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdToExclusive: '2026-09-01T00:00:00.000Z',
    },
    {
      label: 'a reversed range',
      createdFrom: '2026-09-02T00:00:00.000Z',
      createdToExclusive: '2026-09-01T00:00:00.000Z',
    },
    {
      label: 'a range longer than 90 days',
      createdFrom: '2026-01-01T00:00:00.000Z',
      createdToExclusive: '2026-04-02T00:00:00.000Z',
    },
    {
      label: 'an invalid instant',
      createdFrom: 'not-a-date',
      createdToExclusive: '2026-09-01T00:00:00.000Z',
    },
  ])('rejects $label before creating any database operation', async (query) => {
    await expect(ctx.service.getSummary(query)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ctx.prisma.order.aggregate).not.toHaveBeenCalled();
    expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
  });
});
