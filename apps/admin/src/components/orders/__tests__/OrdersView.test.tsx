import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ORDERS_READ } from '@/lib/orders/orders-permissions';
import { OrdersView, type OrdersUrlQuery } from '../OrdersView';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as { permissions: string[] } | null,
  listOrders: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/orders/orders-api', () => ({
  ordersApi: { listOrders: mocks.listOrders, getOrder: vi.fn() },
}));

const item = {
  id: 'order-1042',
  number: 'IR-2026-1042',
  status: 'PENDING_PAYMENT' as const,
  payment: { latestStatus: 'PENDING' as const, attemptCount: 1 },
  fulfillmentStatus: 'PROCESSING' as const,
  itemCount: 2,
  totals: {
    subtotal: { amount: '4570000', currency: 'IRR' as const },
    discount: { amount: '0', currency: 'IRR' as const },
    shipping: { amount: '80000', currency: 'IRR' as const },
    total: { amount: '4650000', currency: 'IRR' as const },
  },
  reservationExpiresAt: '2026-09-18T12:30:00Z',
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: '2026-09-18T11:00:00Z',
  customer: { id: 'customer-1', displayNameMasked: 'م*** ر***', mobileMasked: '0912*****67' },
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
    mocks.user = { permissions: [ORDERS_READ] };
    mocks.listOrders.mockResolvedValue({
      items: [item],
      meta: { page: 1, perPage: 10, total: 1, pages: 1 },
    });
    mocks.replace.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('renders live contract fields and all three independent lifecycles', async () => {
    renderView();

    expect(await screen.findByRole('link', { name: 'IR-2026-1042' })).toBeInTheDocument();
    expect(screen.getByText('م*** ر***')).toBeInTheDocument();
    expect(screen.getByText(/در انتظار پرداخت/)).toBeInTheDocument();
    expect(screen.getByText(/^در انتظار$/)).toBeInTheDocument();
    expect(screen.getByText(/در حال پردازش/)).toBeInTheDocument();
    expect(screen.getByText('۴٬۶۵۰٬۰۰۰ ریال')).toBeInTheDocument();
  });

  it('shows a forbidden state and never requests data without orders.read', async () => {
    mocks.user = { permissions: [] };
    renderView();

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listOrders).not.toHaveBeenCalled();
  });

  it('states the read-only API boundary truthfully', async () => {
    renderView();

    await screen.findByRole('link', { name: 'IR-2026-1042' });
    expect(screen.getByText(/API خواندنی سفارش‌ها/)).toBeInTheDocument();
  });

  it('debounces order-number search into a URL update', async () => {
    renderView();

    const searchBox = await screen.findByRole('textbox', { name: 'جستجو' });
    expect(searchBox).toHaveAttribute('placeholder', 'جستجو فقط با شماره سفارش…');
    fireEvent.change(searchBox, { target: { value: 'IR-2026' } });

    await waitFor(
      () => expect(mocks.replace).toHaveBeenCalledWith('/orders?search=IR-2026', { scroll: false }),
      { timeout: 2000 },
    );
  });

  it('updates the URL with a contract order status', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'فیلتر وضعیت سفارش' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('پیش‌نویس'));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/orders?orderStatus=DRAFT', { scroll: false }));
  });

  it('maps initial URL values into the API query', async () => {
    renderView({ page: '2', search: 'IR', paymentStatus: 'PAID', sortBy: 'grandTotal', sortDir: 'asc' });

    await screen.findByRole('link', { name: 'IR-2026-1042' });
    expect(mocks.listOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, search: 'IR', paymentStatus: 'PAID', sortBy: 'grandTotal', sortDir: 'asc' }),
      expect.any(AbortSignal),
    );
  });

  it('shows the contextual empty state when no order matches', async () => {
    mocks.listOrders.mockResolvedValue({ items: [], meta: { page: 1, perPage: 10, total: 0, pages: 0 } });
    renderView({ orderStatus: 'RETURNED' });

    expect(await screen.findByText('سفارشی یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/فیلترهای فعلی/)).toBeInTheDocument();
  });

  it('links each row to the real detail route', async () => {
    renderView();

    expect(await screen.findByRole('link', { name: 'IR-2026-1042' })).toHaveAttribute('href', '/orders/order-1042');
  });
});
