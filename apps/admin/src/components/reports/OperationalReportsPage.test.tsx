import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OperationalReportsPage,
  reportDayRange,
  initialReportState,
} from './OperationalReportsPage';
import { ApiClientError } from '@/lib/api/client';
const mocks = vi.hoisted(() => ({
  auth: {
    user: {
      userId: 'reporter-a',
      permissions: ['reports.read', 'credit.read'],
    },
    isRestoring: false,
  },
  summary: vi.fn(),
  orders: vi.fn(),
  debtors: vi.fn(),
  options: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/reports/operational-report-api', () => ({
  readOperationalReport: (...args: unknown[]) => mocks.summary(...args),
  readReportOrders: (...args: unknown[]) => mocks.orders(...args),
  readReportDebtors: (...args: unknown[]) => mocks.debtors(...args),
  readReportOptions: (...args: unknown[]) => mocks.options(...args),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
const money = (amount: string) => ({ amount, currency: 'IRR' });
const generatedAt = '2026-10-13T12:00:00Z';
const totals = {
  createdOrderValue: { count: 2, amount: money('9007199254740993') },
  providerSettlements: { count: 0, amount: money('0') },
  recordedGatewayRefunds: { count: 0, amount: money('0') },
  netRecordedCreditReceipts: { count: 1, amount: money('-300') },
  recordedCreditRefundPayouts: { count: 0, amount: money('0') },
  issuedInvoiceValue: { count: 1, amount: money('1000') },
};
const report = {
  generatedAt,
  timezone: 'Asia/Tehran',
  totals,
  timeline: [
    {
      period: '2026-10-13',
      metric: 'createdOrderValue',
      environment: null,
      count: 2,
      amount: money('9007199254740993'),
    },
  ],
  orderStatuses: [
    { status: 'PENDING_PAYMENT', count: 2, amount: money('9007199254740993') },
  ],
  paymentAttemptStatuses: [],
  topItems: [
    {
      sku: 'STORED-A',
      title: '<img onerror="unsafe()">',
      quantity: 2,
      grossValue: money('1000'),
    },
  ],
  unavailable: ['AUTHORITATIVE_INVENTORY_VALUATION'],
};
beforeEach(() => {
  mocks.auth.user = {
    userId: 'reporter-a',
    permissions: ['reports.read', 'credit.read'],
  };
  mocks.auth.isRestoring = false;
  mocks.summary.mockResolvedValue(report);
  mocks.orders.mockResolvedValue({
    generatedAt,
    items: [],
    count: 0,
    offset: 0,
    limit: 25,
  });
  mocks.debtors.mockResolvedValue({
    generatedAt,
    items: [],
    count: 0,
    offset: 0,
    limit: 25,
  });
  mocks.options.mockResolvedValue([]);
});
afterEach(() => vi.resetAllMocks());
describe('Operational Admin reports contract and states', () => {
  it('denies without report permission and waits for restoration before reads', () => {
    mocks.auth.isRestoring = true;
    const view = render(<OperationalReportsPage />);
    expect(screen.getByRole('status')).toHaveTextContent('نشست');
    expect(mocks.summary).not.toHaveBeenCalled();
    mocks.auth.isRestoring = false;
    mocks.auth.user.permissions = [];
    view.rerender(<OperationalReportsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('دسترسی');
    expect(mocks.summary).not.toHaveBeenCalled();
  });
  it('renders exact server money and escaped stored titles without invented paid/net-revenue/valuation', async () => {
    const view = render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    expect(
      screen.getAllByText('۹٬۰۰۷٬۱۹۹٬۲۵۴٬۷۴۰٬۹۹۳ ریال').length,
    ).toBeGreaterThan(0);
    expect(screen.getByText('-۳۰۰ ریال')).toBeVisible();
    expect(view.container.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('img', { name: 'نمودار تعداد ناخالص اقلام تأییدشده' }),
    ).toBeVisible();
    expect(screen.getByText(/ارزش‌گذاری انبار با هزینهٔ معتبر/)).toBeVisible();
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it('requires explicit apply, uses UTC day bounds and backend weekly grouping', async () => {
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    fireEvent.change(screen.getByLabelText('از تاریخ میلادی (UTC)'), {
      target: { value: '2026-10-01' },
    });
    fireEvent.change(screen.getByLabelText('تا پایان تاریخ میلادی (UTC)'), {
      target: { value: '2026-10-02' },
    });
    expect(mocks.summary).toHaveBeenCalledTimes(1);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'گروه‌بندی' }));
    fireEvent.click(screen.getByRole('option', { name: 'هفتگی' }));
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر گزارش' }));
    await waitFor(() =>
      expect(mocks.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: '2026-10-01T00:00:00.000Z',
          toExclusive: '2026-10-03T00:00:00.000Z',
          grain: 'week',
        }),
        expect.any(AbortSignal),
      ),
    );
  });
  it('rejects invalid reversed dates without sending a replacement query', async () => {
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    fireEvent.change(screen.getByLabelText('از تاریخ میلادی (UTC)'), {
      target: { value: '2026-10-15' },
    });
    fireEvent.change(screen.getByLabelText('تا پایان تاریخ میلادی (UTC)'), {
      target: { value: '2026-10-14' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر گزارش' }));
    expect(screen.getByText(/تاریخ‌های معتبر/)).toBeVisible();
    expect(mocks.summary).toHaveBeenCalledOnce();
  });
  it('shows safe network failure and retries a read with original filters', async () => {
    mocks.summary
      .mockRejectedValueOnce(new Error('private contact SQL'))
      .mockResolvedValueOnce(report);
    render(<OperationalReportsPage />);
    await screen.findByRole('button', { name: 'تلاش دوباره گزارش' });
    expect(screen.queryByText('private contact SQL')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره گزارش' }));
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    expect(mocks.summary).toHaveBeenCalledTimes(2);
    expect(mocks.summary.mock.calls[1][0]).toEqual(
      mocks.summary.mock.calls[0][0],
    );
  });
  it('renders real empty reporting without demo items', async () => {
    mocks.summary.mockResolvedValue({
      ...report,
      timeline: [],
      topItems: [],
      orderStatuses: [],
    });
    render(<OperationalReportsPage />);
    await screen.findByText('در این بازه رویدادی ثبت نشده است.');
    expect(
      screen.getByText('فروش تأییدشده‌ای در این بازه ثبت نشده است.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'اقلام پرفروش ناخالص' }),
    ).not.toBeInTheDocument();
  });
  it('keeps debtor permission and source options independent from general report access', async () => {
    mocks.auth.user.permissions = ['reports.read'];
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    expect(
      screen.getByRole('tab', { name: 'بدهکاران و سررسید' }),
    ).toBeDisabled();
    expect(mocks.debtors).not.toHaveBeenCalled();
    expect(mocks.options).not.toHaveBeenCalled();
  });
  it('reads bounded order pages without implying a payment from an unpaid order total', async () => {
    mocks.orders.mockResolvedValue({
      generatedAt,
      items: [
        {
          id: 'order-a',
          number: 'ORDER-A',
          status: 'PENDING_PAYMENT',
          createdAt: generatedAt,
          total: money('1000'),
          paymentAttempts: 1,
          providerSettled: money('0'),
          gatewayRefunded: money('0'),
          issuedInvoiceNumber: null,
        },
      ],
      count: 26,
      offset: 0,
      limit: 25,
    });
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    fireEvent.click(screen.getByRole('tab', { name: 'سفارش و پرداخت' }));
    const table = await screen.findByRole('table', {
      name: 'گزارش سفارش و پرداخت',
    });
    expect(table).toHaveTextContent('در انتظار پرداخت');
    expect(table).toHaveTextContent('صادر نشده');
    expect(screen.getByRole('link', { name: 'ORDER-A' })).toHaveAttribute(
      'href',
      '/orders/order-a',
    );
    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعد' }));
    await waitFor(() =>
      expect(mocks.orders).toHaveBeenLastCalledWith(
        expect.any(Object),
        25,
        expect.any(AbortSignal),
      ),
    );
  });
  it('shows debtor empty and authoritative aging only with the separate permission', async () => {
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    fireEvent.click(screen.getByRole('tab', { name: 'بدهکاران و سررسید' }));
    await screen.findByText('بدهی یا تعهد برگشت وجهی با این فیلتر وجود ندارد.');
    expect(mocks.debtors).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, asOf: expect.any(String) }),
      expect.any(AbortSignal),
    );
    expect(mocks.debtors.mock.calls[0][0]).not.toHaveProperty('productId');
  });
  it('fetches real source selectors only with matching source permissions and handles their failure', async () => {
    mocks.auth.user.permissions.push('customers.read', 'catalog.read');
    mocks.options.mockImplementation(async (kind: string) =>
      kind === 'customer'
        ? [{ id: 'customer-a', label: 'Customer A' }]
        : Promise.reject(new Error('private source')),
    );
    render(<OperationalReportsPage />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    await screen.findByText('فهرست محصول دریافت نشد؛ دوباره جستجو کنید.');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'انتخاب مشتری' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Customer A' }));
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر گزارش' }));
    await waitFor(() =>
      expect(mocks.summary).toHaveBeenLastCalledWith(
        expect.objectContaining({ customerId: 'customer-a' }),
        expect.any(AbortSignal),
      ),
    );
  });
  it('aborts old-principal requests and never renders a late private report in a new staff account', async () => {
    let release!: (value: unknown) => void;
    mocks.summary.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const view = render(<OperationalReportsPage />);
    await waitFor(() => expect(mocks.summary).toHaveBeenCalledOnce());
    const signal = mocks.summary.mock.calls[0][1];
    mocks.auth.user = { userId: 'reporter-b', permissions: ['reports.read'] };
    mocks.summary.mockResolvedValue({
      ...report,
      timeline: [],
      topItems: [],
      orderStatuses: [],
    });
    view.rerender(<OperationalReportsPage />);
    await screen.findByText('در این بازه رویدادی ثبت نشده است.');
    await act(async () => release(report));
    expect(signal.aborted).toBe(true);
    expect(
      screen.queryByRole('table', { name: 'روند زمانی گزارش' }),
    ).not.toBeInTheDocument();
  });
  it('keeps 403 permission failures explicit with no fabricated totals', async () => {
    mocks.summary.mockRejectedValue(
      new ApiClientError({
        code: 'FORBIDDEN',
        requestId: 'isolated-report-test',
        message: 'private',
        statusCode: 403,
      }),
    );
    render(<OperationalReportsPage />);
    await screen.findByText(/دسترسی گزارش تغییر کرده است/);
    expect(screen.queryByText('private')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'روند زمانی گزارش' }),
    ).not.toBeInTheDocument();
  });
  it('strictly validates real calendar days and the maximum annual bound', () => {
    expect(reportDayRange('2026-01-01', '2026-01-02')).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      toExclusive: '2026-01-03T00:00:00.000Z',
    });
    for (const [from, to] of [
      ['2026-02-30', '2026-03-02'],
      ['', '2026-01-01'],
      ['2026-01-02', '2026-01-01'],
      ['2026-01-01', '2028-01-01'],
    ])
      expect(() => reportDayRange(from, to)).toThrow();
  });
});

describe('Report URL restoration', () => {
  const now = '2026-10-14T06:00:00.000Z';
  it('restores bounded applied filters, tab, paging and the exact debtor instant', () => {
    const state = initialReportState(
      {
        from: '2026-01-01',
        to: '2026-01-31',
        grain: 'month',
        customerId: 'customer-a',
        productId: 'product-a',
        status: 'CREDIT_APPROVED',
        view: 'debtors',
        offset: '25',
        asOf: '2026-01-31T12:00:00.000Z',
      },
      now,
    );
    expect(state).toMatchObject({
      view: 'debtors',
      offset: 25,
      asOf: '2026-01-31T12:00:00.000Z',
      query: {
        from: '2026-01-01T00:00:00.000Z',
        toExclusive: '2026-02-01T00:00:00.000Z',
        grain: 'month',
        customerId: 'customer-a',
        status: 'CREDIT_APPROVED',
      },
    });
  });
  it.each([
    { from: ['2026-01-01', '2026-01-02'] },
    { to: '2026-02-30' },
    { grain: 'quarter' },
    { customerId: 'unsafe?id' },
    { status: 'FAKE_PAID' },
    { view: 'secret' },
    { offset: '1000001' },
    { asOf: '2026-12-01T00:00:00.000Z' },
    { asOf: '2026-02-30T00:00:00.000Z' },
    { token: 'unapproved' },
  ])(
    'rejects invalid URL filters instead of showing an unfiltered report: %j',
    (raw) => {
      expect(() => initialReportState(raw, now)).toThrow();
    },
  );
  it('invalid URL and missing compound permission never read another report as a fallback', () => {
    const view = render(
      <OperationalReportsPage
        initialFilters={{ token: 'unapproved' }}
        now={now}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('فیلتر');
    expect(mocks.summary).not.toHaveBeenCalled();
    mocks.auth.user.permissions = ['reports.read'];
    view.rerender(
      <OperationalReportsPage initialFilters={{ view: 'debtors' }} now={now} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('دفترکل');
    expect(mocks.debtors).not.toHaveBeenCalled();
  });
  it('persists applied dates and current tab, then restores them on reload', async () => {
    const view = render(<OperationalReportsPage now={now} />);
    await screen.findByRole('table', { name: 'روند زمانی گزارش' });
    fireEvent.change(screen.getByLabelText('از تاریخ میلادی (UTC)'), {
      target: { value: '2026-01-01' },
    });
    fireEvent.change(screen.getByLabelText('تا پایان تاریخ میلادی (UTC)'), {
      target: { value: '2026-01-31' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر گزارش' }));
    fireEvent.click(screen.getByRole('tab', { name: 'سفارش و پرداخت' }));
    const initialFilters = Object.fromEntries(
      new URLSearchParams(window.location.search),
    );
    expect(initialFilters).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      view: 'orders',
    });
    view.unmount();
    mocks.orders.mockClear();
    render(
      <OperationalReportsPage initialFilters={initialFilters} now={now} />,
    );
    await waitFor(() => expect(mocks.orders).toHaveBeenCalled());
    expect(mocks.orders.mock.calls[0][0]).toMatchObject({
      from: '2026-01-01T00:00:00.000Z',
      toExclusive: '2026-02-01T00:00:00.000Z',
    });
  });
});
