import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDERS_READ, ORDERS_WRITE } from '@/lib/orders/orders-permissions';
import { OrderDetailView } from '../OrderDetailView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  getOrder: vi.fn(),
}));

vi.mock('@/lib/orders/orders-fixture', () => ({
  ordersApi: { listOrders: vi.fn(), getOrder: mocks.getOrder },
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

const detail = {
  id: 'ord-1001',
  orderNumber: 'IR-10-4821',
  createdAt: '2026-09-08T10:00:00Z',
  updatedAt: '2026-09-08T11:00:00Z',
  customer: { fullName: 'مشتری نمونهٔ یک', mobile: '09120000001' },
  orderStatus: 'PROCESSING' as const,
  paymentStatus: 'PAID' as const,
  fulfillmentStatus: 'ALLOCATED' as const,
  subtotalRials: 4_650_000,
  shippingRials: 80_000,
  totalRials: 4_730_000,
  shipping: { province: 'تهران', city: 'تهران', postalCode: '1234567890', address: 'خیابان نمونه' },
  lines: [
    {
      id: 'l1',
      productName: 'دستگیرهٔ در استیل',
      sku: 'HND-ST-240',
      quantity: 2,
      unitPriceRials: 1_800_000,
      lineTotalRials: 3_600_000,
    },
    {
      id: 'l2',
      productName: 'قفل چندمنظوره',
      sku: 'LCK-MP-102',
      quantity: 1,
      unitPriceRials: 1_050_000,
      lineTotalRials: 1_050_000,
    },
  ],
};

describe('OrderDetailView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [ORDERS_READ, ORDERS_WRITE] };
    mocks.getOrder.mockResolvedValue(detail);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the order badges, customer facts, lines and totals', async () => {
    render(<OrderDetailView orderId="ord-1001" />);

    expect(await screen.findByText('IR-10-4821')).toBeInTheDocument();
    expect(screen.getByText(/در حال پردازش/)).toBeInTheDocument();
    expect(screen.getByText(/پرداخت‌شده/)).toBeInTheDocument();
    expect(screen.getByText(/تخصیص‌یافته/)).toBeInTheDocument();
    expect(screen.getByText('مشتری نمونهٔ یک')).toBeInTheDocument();
    expect(screen.getByText('دستگیرهٔ در استیل')).toBeInTheDocument();
    expect(screen.getByText('قفل چندمنظوره')).toBeInTheDocument();
    expect(screen.getByText('مبلغ نهایی')).toBeInTheDocument();
    expect(screen.getByText('۴٬۷۳۰٬۰۰۰ ریال')).toBeInTheDocument();
  });

  it('shows a forbidden state without orders.read', async () => {
    mocks.user = { permissions: [] };
    render(<OrderDetailView orderId="ord-1001" />);

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it('shows the read-only notice for readers without orders.write', async () => {
    mocks.user = { permissions: [ORDERS_READ] };
    render(<OrderDetailView orderId="ord-1001" />);

    await screen.findByText('IR-10-4821');
    expect(screen.getByText(/فقط دسترسی خواندن/)).toBeInTheDocument();
  });

  it('renders the not-found state for an unknown order', async () => {
    mocks.getOrder.mockRejectedValue(new Error('سفارش یافت نشد.'));
    render(<OrderDetailView orderId="ord-missing" />);

    expect(await screen.findByText('سفارش یافت نشد')).toBeInTheDocument();
  });
});