import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/returns/returns-api';
import { ReturnsView } from '../ReturnsView';

const auth = vi.hoisted(() => ({ permissions: ['returns.read'] as string[], isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1', permissions: auth.permissions }, isRestoring: auth.isRestoring }) }));
vi.mock('@/lib/returns/returns-api', () => ({ listReturns: vi.fn() }));

const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const row = {
  id: 'r1', orderId: 'o1', orderNumber: 'A-1', number: 'A-1-R1', sequence: 1, windowKind: 'DELIVERY' as const, policyRevision: 'returns-v1',
  invoiceIssuedAt: '2026-11-09T08:00:00.000Z', deadlineAt: '2026-11-16T20:29:59.999Z', returnedAt: '2026-11-10T08:00:00.000Z',
  merchandiseRefund: money('1000'), shippingRefund: money('0'), refundDue: money('1000'), refunded: money('400'), refundRemaining: money('600'),
  reason: 'x', note: null, lines: [], createdAt: '2026-11-10T08:00:00.000Z',
};

describe('ReturnsView', () => {
  beforeEach(() => {
    auth.permissions = ['returns.read']; auth.isRestoring = false;
    vi.mocked(api.listReturns).mockReset().mockResolvedValue({ items: [row], meta: { page: 1, perPage: 25, total: 1, pages: 1 } });
  });

  it('shows a forbidden state and issues no request without returns.read', () => {
    auth.permissions = [];
    render(<ReturnsView />);
    expect(screen.getByText('دسترسی ندارید')).toBeInTheDocument();
    expect(api.listReturns).not.toHaveBeenCalled();
  });

  it('lists real returns with their refund progress and links to the order', async () => {
    render(<ReturnsView />);
    const table = await screen.findByRole('table', { name: 'فهرست مرجوعی‌ها' });
    expect(table).toHaveTextContent('A-1-R1');
    expect(table).toHaveTextContent('شهر دیگر');
    expect(screen.getByRole('link', { name: 'A-1' })).toHaveAttribute('href', '/orders/o1');
  });

  it('filters by order number from the first page', async () => {
    render(<ReturnsView />);
    await screen.findByRole('table', { name: 'فهرست مرجوعی‌ها' });
    fireEvent.change(screen.getByLabelText('شمارهٔ سفارش'), { target: { value: ' A-9 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'جست‌وجو' }));
    await waitFor(() => expect(api.listReturns).toHaveBeenLastCalledWith({ page: 1, perPage: 25, orderNumber: 'A-9' }, expect.anything()));
  });

  it('shows an explicit error instead of an empty list when loading fails', async () => {
    vi.mocked(api.listReturns).mockRejectedValue(new Error('boom'));
    render(<ReturnsView />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
