import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORDERS_READ } from '@/lib/orders/orders-permissions';
import { OrderDetailView } from '../OrderDetailView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  getOrder: vi.fn(),
}));

vi.mock('@/lib/orders/orders-api', () => ({
  ordersApi: { listOrders: vi.fn(), getOrder: mocks.getOrder },
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

const detail = {
  id: 'order-1042',
  number: 'IR-2026-1042',
  status: 'PAID' as const,
  payment: { latestStatus: 'PAID' as const, attemptCount: 1 },
  fulfillmentStatus: 'PROCESSING' as const,
  itemCount: 2,
  totals: {
    subtotal: { amount: '4650000', currency: 'IRR' as const },
    discount: { amount: '0', currency: 'IRR' as const },
    shipping: { amount: '80000', currency: 'IRR' as const },
    total: { amount: '4730000', currency: 'IRR' as const },
  },
  reservationExpiresAt: '2026-09-18T12:30:00Z',
  createdAt: '2026-09-18T10:00:00Z',
  updatedAt: '2026-09-18T11:00:00Z',
  customer: { id: 'customer-1', displayNameMasked: 'م*** ر***', mobileMasked: '0912*****67' },
  address: {
    provinceCode: '23',
    city: 'تهران',
    addressMasked: 'خ*** و***',
    postalCodeMasked: '123*****90',
    recipientMasked: 'م*** ر***',
    mobileMasked: '0912*****67',
  },
  shippingMethod: { code: 'standard', title: 'ارسال استاندارد' },
  pricePolicyRevision: 'price-2026-09',
  shippingPolicyRevision: 'shipping-2026-09',
  items: [
    {
      variantId: 'variant-1',
      sku: 'SKU-001',
      productTitle: 'یراق‌آلات کابینت',
      variantTitle: 'استیل',
      quantity: 2,
      unitPrice: { amount: '2325000', currency: 'IRR' as const },
      lineTotal: { amount: '4650000', currency: 'IRR' as const },
    },
  ],
  payments: [
    {
      id: 'payment-1',
      status: 'PAID' as const,
      amount: { amount: '4730000', currency: 'IRR' as const },
      createdAt: '2026-09-18T10:05:00Z',
      updatedAt: '2026-09-18T10:06:00Z',
    },
  ],
  fulfillment: {
    status: 'PROCESSING' as const,
    createdAt: '2026-09-18T10:10:00Z',
    updatedAt: '2026-09-18T10:20:00Z',
  },
  timeline: [
    {
      domain: 'ORDER' as const,
      from: 'PENDING_PAYMENT' as const,
      to: 'PAID' as const,
      reason: 'پرداخت تأیید شد',
      actor: null,
      requestId: 'request-order-1',
      createdAt: '2026-09-18T10:06:00Z',
    },
  ],
  audit: [
    {
      action: 'ORDER_READ_CREATED',
      actor: { id: 'staff-1', displayNameMasked: 'ک*** پ***' },
      requestId: 'request-audit-1',
      createdAt: '2026-09-18T10:00:00Z',
    },
  ],
  truncation: { items: false, payments: false, timeline: false, audit: false },
};

describe('OrderDetailView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [ORDERS_READ] };
    mocks.getOrder.mockResolvedValue(detail);
  });

  afterEach(() => vi.clearAllMocks());

  it('renders the complete safe admin order contract', async () => {
    render(<OrderDetailView orderId="order-1042" />);

    expect(await screen.findByRole('heading', { name: 'سفارش IR-2026-1042' })).toBeInTheDocument();
    expect(screen.getAllByText('م*** ر***')).toHaveLength(2);
    expect(screen.getByText('خ*** و***')).toBeInTheDocument();
    expect(screen.getByText('یراق‌آلات کابینت')).toBeInTheDocument();
    expect(screen.getAllByText('۴٬۷۳۰٬۰۰۰ ریال').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('پرداخت تأیید شد')).toBeInTheDocument();
    expect(screen.getByText('ORDER_READ_CREATED')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'تلاش‌های پرداخت' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'خط زمانی وضعیت‌های سفارش' })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'رویدادهای ممیزی سفارش' })).toBeInTheDocument();
  });

  it('passes an abort signal to the API', async () => {
    render(<OrderDetailView orderId="order-1042" />);

    await screen.findByRole('heading', { name: 'سفارش IR-2026-1042' });
    expect(mocks.getOrder).toHaveBeenCalledWith('order-1042', expect.any(AbortSignal));
  });

  it('shows a forbidden state and does not request detail without orders.read', async () => {
    mocks.user = { permissions: [] };
    render(<OrderDetailView orderId="order-1042" />);

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.getOrder).not.toHaveBeenCalled();
  });

  it('renders the not-found state for an unknown order', async () => {
    mocks.getOrder.mockRejectedValue(new Error('سفارش یافت نشد.'));
    render(<OrderDetailView orderId="missing" />);

    expect(await screen.findByText('سفارش یافت نشد')).toBeInTheDocument();
  });

  it('warns when a bounded history is truncated', async () => {
    mocks.getOrder.mockResolvedValue({ ...detail, truncation: { ...detail.truncation, audit: true } });
    render(<OrderDetailView orderId="order-1042" />);

    expect(await screen.findByText(/رویدادهای ممیزی به سقف نمایش رسیده/)).toBeInTheDocument();
  });
});
