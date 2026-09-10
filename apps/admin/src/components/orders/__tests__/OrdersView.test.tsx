import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ORDERS_READ, ORDERS_WRITE } from '@/lib/orders/orders-permissions';
import { OrdersView, type OrdersUrlQuery } from '../OrdersView';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as { permissions: string[] } | null,
  listOrders: vi.fn(),
  getOrder: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/orders/orders-fixture', () => ({
  ordersApi: { listOrders: mocks.listOrders, getOrder: mocks.getOrder },
}));

const item = {
  id: 'ord-1001',
  orderNumber: 'IR-10-4821',
  createdAt: '2026-09-08T10:00:00Z',
  updatedAt: '2026-09-08T11:00:00Z',
  customer: { fullName: 'مشتری نمونهٔ یک', mobile: '09120000001' },
  totalRials: 4_650_000,
  orderStatus: 'PROCESSING' as const,
  paymentStatus: 'PAID' as const,
  fulfillmentStatus: 'ALLOCATED' as const,
};

function renderView(initialQuery: OrdersUrlQuery = {}) {
  return render(
    <FeedbackProvider>
      <OrdersView initialQuery={initialQuery} />
    </FeedbackProvider>,
  );
}

describe('OrdersView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [ORDERS_READ, ORDERS_WRITE] };
    mocks.listOrders.mockResolvedValue({
      items: [item],
      meta: { page: 1, perPage: 10, total: 1, pages: 1 },
    });
    mocks.replace.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the order queue with the three separated status badges', async () => {
    renderView();

    expect(await screen.findByText('IR-10-4821')).toBeInTheDocument();
    expect(screen.getByText(/در حال پردازش/)).toBeInTheDocument();
    expect(screen.getByText(/پرداخت‌شده/)).toBeInTheDocument();
    expect(screen.getByText(/تخصیص‌یافته/)).toBeInTheDocument();
    expect(screen.getByText(/۴٬۶۵۰٬۰۰۰ ریال/)).toBeInTheDocument();
  });

  it('shows a forbidden state without orders.read', async () => {
    mocks.user = { permissions: [] };
    renderView();

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(screen.queryByText('IR-10-4821')).not.toBeInTheDocument();
  });

  it('shows the read-only notice for readers without orders.write', async () => {
    mocks.user = { permissions: [ORDERS_READ] };
    renderView();

    await screen.findByText('IR-10-4821');
    expect(screen.getByText(/فقط دسترسی خواندن/)).toBeInTheDocument();
  });

  it('debounces the search box into a URL update', async () => {
    renderView();

    const searchBox = await screen.findByRole('textbox', { name: 'جستجو' });
    fireEvent.change(searchBox, { target: { value: 'IR-10' } });

    await waitFor(
      () => expect(mocks.replace).toHaveBeenCalledWith('/orders?search=IR-10', { scroll: false }),
      { timeout: 2000 },
    );
  });

  it('updates the URL when an order status filter is selected', async () => {
    renderView();
    await screen.findByText('IR-10-4821');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'فیلتر وضعیت سفارش' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('تکمیل‌شده'));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/orders?orderStatus=COMPLETED', { scroll: false }));
  });

  it('reflects the initial query values from the URL', async () => {
    renderView({ page: '2', search: 'IR', paymentStatus: 'PAID' });

    await screen.findByText('IR-10-4821');
    expect(mocks.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, search: 'IR', paymentStatus: 'PAID' }),
    );
  });

  it('shows the empty state when nothing matches', async () => {
    mocks.listOrders.mockResolvedValue({
      items: [],
      meta: { page: 1, perPage: 10, total: 0, pages: 0 },
    });
    renderView();

    expect(await screen.findByText('سفارشی یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/۰ سفارش/)).toBeInTheDocument();
  });

  it('links each row to its detail page', async () => {
    renderView();

    await screen.findByText('IR-10-4821');
    expect(screen.getByRole('link', { name: /IR-10-4821/ })).toHaveAttribute('href', '/orders/ord-1001');
  });
});