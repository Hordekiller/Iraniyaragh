import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminDashboardSummary } from '@iranyaragh/contracts';
import { REPORTS_READ } from '@/lib/dashboard/dashboard-permissions';
import { DashboardView } from '../DashboardView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  useDashboardSummary: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('../useDashboardSummary', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useDashboardSummary')>();
  return { ...actual, useDashboardSummary: mocks.useDashboardSummary };
});

const summary: AdminDashboardSummary = {
  generatedAt: '2026-09-19T08:00:00.000Z',
  presentationTimezone: 'Asia/Tehran',
  range: {
    createdFrom: '2026-09-12T08:00:00.000Z',
    createdToExclusive: '2026-09-19T08:00:00.000Z',
  },
  rangeMetrics: {
    ordersCreated: 12,
    grossOrderValue: { amount: '1234567890', currency: 'IRR' },
  },
  commerceSnapshot: {
    ordersByStatus: [
      { status: 'DRAFT', count: 2 },
      { status: 'PAID', count: 10 },
    ],
    paymentAttemptsByStatus: [{ status: 'PAID', count: 9 }],
    fulfillmentsByStatus: [{ status: 'SHIPPED', count: 4 }],
    ordersWithoutPaymentAttempts: 3,
    ordersWithoutFulfillment: 5,
  },
  inventorySnapshot: {
    zeroAvailableBalances: 7,
    activeReservations: 6,
    reservationsByStatus: [{ status: 'ACTIVE', count: 6 }],
    transfersByStatus: [{ status: 'IN_TRANSIT', count: 1 }],
  },
};

describe('DashboardView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [REPORTS_READ] };
    mocks.refresh.mockReset();
    mocks.useDashboardSummary.mockReset();
    mocks.useDashboardSummary.mockReturnValue({
      summary,
      loading: false,
      error: null,
      refresh: mocks.refresh,
    });
  });

  it('fails closed before rendering or requesting dashboard content', () => {
    mocks.user = { permissions: [] };
    render(<DashboardView />);

    expect(screen.getByRole('heading', { name: 'دسترسی ندارید' })).toBeInTheDocument();
    expect(mocks.useDashboardSummary).toHaveBeenCalledWith(7, false);
    expect(screen.queryByText('۱٬۲۳۴٬۵۶۷٬۸۹۰ ریال')).not.toBeInTheDocument();
  });

  it('renders only server-provided factual metrics with visible chart values and table fallback', () => {
    render(<DashboardView />);

    expect(screen.getByRole('heading', { level: 1, name: 'داشبورد عملیاتی' })).toBeInTheDocument();
    expect(screen.getByText('۱٬۲۳۴٬۵۶۷٬۸۹۰ ریال')).toBeInTheDocument();
    expect(screen.getByText('همهٔ وضعیت‌ها؛ معادل فروش قطعی نیست')).toBeInTheDocument();
    expect(screen.getByText('آستانهٔ «موجودی کم» تعریف نشده است')).toBeInTheDocument();
    expect(screen.getByLabelText('نمودار سفارش‌ها')).toBeInTheDocument();
    expect(screen.getAllByText('پیش‌نویس').length).toBeGreaterThan(0);
    expect(screen.getAllByText('۱۰').length).toBeGreaterThan(0);
    expect(screen.getAllByText('مشاهدهٔ جدول داده')).toHaveLength(5);
  });

  it('requests a new explicit range when the operator changes the selection', () => {
    render(<DashboardView />);
    fireEvent.click(screen.getByRole('button', { name: '۳۰ روز' }));
    expect(mocks.useDashboardSummary).toHaveBeenLastCalledWith(30, true);
  });

  it('shows an actionable retry for transport failures', () => {
    mocks.useDashboardSummary.mockReturnValue({
      summary: null,
      loading: false,
      error: { kind: 'network', message: 'امکان ارتباط وجود ندارد.' },
      refresh: mocks.refresh,
    });
    render(<DashboardView />);

    fireEvent.click(screen.getByRole('button', { name: /تلاش دوباره/ }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('announces the loading state without exposing stale values', () => {
    mocks.useDashboardSummary.mockReturnValue({
      summary: null,
      loading: true,
      error: null,
      refresh: mocks.refresh,
    });
    render(<DashboardView />);

    expect(screen.getByLabelText('در حال بارگیری داشبورد')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('۱٬۲۳۴٬۵۶۷٬۸۹۰ ریال')).not.toBeInTheDocument();
  });
});
