import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsView } from '../PaymentsView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  list: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/payments/payments-api', () => ({ listPayments: mocks.list }));

const payment = {
  id: 'payment-1',
  order: { id: 'order-1', number: 'IR-1001', status: 'PAID' },
  provider: 'zarinpal', amount: { amount: '123000', currency: 'IRR' },
  status: 'PAID', referenceId: 'ref-1', gatewayEnvironment: 'sandbox',
  createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:01:00.000Z',
};

describe('PaymentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { permissions: ['payments.read'] };
    mocks.list.mockResolvedValue({ items: [payment], meta: { page: 1, perPage: 25, total: 1, pages: 1 } });
  });

  it('renders live payment evidence without a financial mutation action', async () => {
    render(<PaymentsView />);
    expect(await screen.findByRole('link', { name: 'IR-1001' })).toHaveAttribute('href', '/payments/payment-1');
    expect(screen.getByText('۱۲۳٬۰۰۰ ریال')).toBeInTheDocument();
    expect(screen.getByText('ref-1')).toBeInTheDocument();
    expect(screen.getByText(/فقط‌خواندنی/)).toBeInTheDocument();
  });

  it('never fetches without payments.read', async () => {
    mocks.user = { permissions: ['orders.read'] };
    render(<PaymentsView />);
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it('filters by order number without searching PII', async () => {
    render(<PaymentsView />);
    await screen.findByRole('link', { name: 'IR-1001' });
    fireEvent.change(screen.getByRole('textbox', { name: 'شماره سفارش' }), { target: { value: 'IR-1001' } });
    fireEvent.click(screen.getByRole('button', { name: 'جستجو' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'IR-1001' }), expect.any(AbortSignal)));
  });
});
