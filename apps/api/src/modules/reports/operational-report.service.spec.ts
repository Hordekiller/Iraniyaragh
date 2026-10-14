import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../database/prisma.service';
import { OperationalReportService } from './operational-report.service';
const query = {
  from: '2026-01-01T00:00:00Z',
  toExclusive: '2026-01-02T00:00:00Z',
};
function setup() {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(),
    customer: {
      findMany: vi.fn(async () => [
        { id: 'customer-a', firstName: 'Isolated', lastName: 'Name' },
      ]),
    },
    product: {
      findMany: vi.fn(async () => [{ id: 'product-a', name: 'Stored name' }]),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  return {
    tx,
    prisma,
    service: new OperationalReportService(prisma as unknown as PrismaService),
  };
}
describe('Operational report projection, transaction budget and safe failure', () => {
  let state: ReturnType<typeof setup>;
  beforeEach(() => {
    state = setup();
  });
  it('uses bounded name-only selector projections and never returns raw customer/contact metadata', async () => {
    expect(await state.service.options('customer', 'Isolated')).toEqual({
      items: [{ id: 'customer-a', label: 'Isolated Name' }],
    });
    expect(await state.service.options('product', 'Stored')).toEqual({
      items: [{ id: 'product-a', label: 'Stored name' }],
    });
    expect(state.tx.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 25,
        select: { id: true, firstName: true, lastName: true },
      }),
    );
    await expect(
      state.service.options('product', 'x'.repeat(65)),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
  });
  it('preserves signed large IRR aggregates and labels independent financial evidence', async () => {
    state.tx.$queryRaw
      .mockResolvedValueOnce([
        {
          period: '2026-01-01',
          metric: 'createdOrderValue',
          environment: null,
          count: '2',
          amount: '18014398509481986',
        },
        {
          period: '2026-01-01',
          metric: 'netRecordedCreditReceipts',
          environment: null,
          count: '1',
          amount: '-300',
        },
      ])
      .mockResolvedValueOnce([
        { status: 'DRAFT', count: '2', amount: '18014398509481986' },
      ])
      .mockResolvedValueOnce([{ status: 'FAILED', count: '2', amount: '2000' }])
      .mockResolvedValueOnce([
        {
          sku: 'STORED-SKU',
          title: 'Stored title',
          quantity: '2',
          amount: '2000',
        },
      ]);
    const result = await state.service.summary({
      ...query,
      productId: 'product-a',
      customerId: 'customer-a',
      status: 'DRAFT',
      grain: 'week',
    });
    expect(result.totals.createdOrderValue.amount.amount).toBe(
      '18014398509481986',
    );
    expect(result.totals.netRecordedCreditReceipts.amount.amount).toBe('-300');
    expect(result.totals.providerSettlements.amount.amount).toBe('0');
    expect(result.productFilterScope).toBe('ORDERS_CONTAINING_PRODUCT');
    expect(result.topItems[0]).toMatchObject({
      quantity: 2,
      grossValue: { amount: '2000' },
    });
    expect(state.tx.$queryRaw).toHaveBeenCalledTimes(4);
    expect(state.prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: 'RepeatableRead', timeout: 10000, maxWait: 2000 },
    );
    expect(state.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it('returns exact empty evidence rather than a seeded/demo report', async () => {
    state.tx.$queryRaw.mockResolvedValue([]);
    const result = await state.service.summary(query);
    expect(result.timeline).toEqual([]);
    expect(result.topItems).toEqual([]);
    expect(
      Object.values(result.totals).every(
        (value) => value.amount.amount === '0',
      ),
    ).toBe(true);
  });
  it('projects bounded order proof without raw gateway references, customer addresses or staff notes', async () => {
    state.tx.$queryRaw
      .mockResolvedValueOnce([{ total: '1' }])
      .mockResolvedValueOnce([
        {
          id: 'order-a',
          number: 'ORDER',
          customerId: 'customer-a',
          status: 'PENDING_PAYMENT',
          createdAt: new Date(query.from),
          total: 9007199254740993n,
          attempts: '2',
          settled: '0',
          refunded: '0',
          invoice: null,
          staffNote: 'private',
          addressSnapshot: 'private',
          authority: 'provider secret',
        },
      ]);
    const result = await state.service.orders({
      ...query,
      offset: '25',
      limit: '1',
    });
    expect(result).toMatchObject({
      count: 1,
      offset: 25,
      limit: 1,
      items: [
        {
          total: { amount: '9007199254740993' },
          paymentAttempts: 2,
          providerSettled: { amount: '0' },
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /private|authority|provider secret/,
    );
  });
  it('returns immutable-ledger aging money, explicit as-of and no identity/receipt internals', async () => {
    state.tx.$queryRaw
      .mockResolvedValueOnce([{ total: '1' }])
      .mockResolvedValueOnce([
        {
          accountId: 'account-a',
          customerId: 'customer-a',
          accountStatus: 'SUSPENDED',
          documents: '1',
          outstanding: '9007199254740993',
          notDue: '0',
          overdueUpTo30Days: '9007199254740993',
          overdue31To60Days: '0',
          overdue61To90Days: '0',
          overdueOver90Days: '0',
          refundObligation: '300',
        },
      ]);
    const result = await state.service.debtors({
      asOf: query.from,
      customerId: 'customer-a',
    });
    expect(result.items[0]).toMatchObject({
      documents: 1,
      outstanding: { amount: '9007199254740993' },
      refundObligation: { amount: '300' },
    });
    expect(result.asOf).toBe('2026-01-01T00:00:00.000Z');
  });
  it('does not turn a database timeout/raw exception into zeros or leaked diagnostics', async () => {
    state.tx.$queryRaw.mockRejectedValue(
      new Error('raw customer contact credential'),
    );
    for (const read of [
      () => state.service.summary(query),
      () => state.service.orders(query),
      () => state.service.debtors({ asOf: query.from }),
    ])
      await expect(read()).rejects.toMatchObject({
        response: {
          code: 'REPORT_UNAVAILABLE',
          message: expect.not.stringContaining('raw customer'),
        },
      });
  });
  it('rejects unsafe aggregate counts instead of silently rounding them', async () => {
    state.tx.$queryRaw
      .mockResolvedValueOnce([{ total: '9007199254740993' }])
      .mockResolvedValueOnce([]);
    await expect(state.service.orders(query)).rejects.toMatchObject({
      response: { code: 'REPORT_UNAVAILABLE' },
    });
  });
  it('validates ranges before any transaction/query', async () => {
    await expect(
      state.service.summary({ ...query, from: 'not a date' }),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REQUEST' } });
    expect(state.prisma.$transaction).not.toHaveBeenCalled();
  });
});
