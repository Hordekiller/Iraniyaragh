import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentDetailView } from '../PaymentDetailView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  get: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/payments/payments-api', () => ({ getPayment: mocks.get, reconcilePayment: mocks.reconcile }));

const pending = {
  id: 'payment-1', order: { id: 'order-1', number: 'IR-1001', status: 'PENDING_PAYMENT' },
  provider: 'zarinpal', amount: { amount: '123000', currency: 'IRR' },
  status: 'PENDING', referenceId: null, gatewayEnvironment: 'sandbox',
  createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:01:00.000Z',
  transitions: [], transitionsTruncated: false, reconciliationEligible: true,
};

describe('PaymentDetailView reconciliation action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { permissions: ['payments.read', 'payments.reconcile'] };
    mocks.get.mockResolvedValue(pending);
    mocks.reconcile.mockResolvedValue({
      paymentId: 'payment-1', status: 'PAID', outcome: 'VERIFIED', referenceId: 'ref-1',
      orderId: 'order-1', orderStatus: 'PAID',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('requires permission and eligibility before showing the command', async () => {
    mocks.user = { permissions: ['payments.read'] };
    render(<PaymentDetailView paymentId="payment-1" />);
    await screen.findByText(/پرداخت سفارش IR-1001/);
    expect(screen.queryByRole('button', { name: /بررسی دوبارهٔ وضعیت نامشخص/ })).not.toBeInTheDocument();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and refreshes server state after recheck', async () => {
    mocks.get.mockResolvedValueOnce(pending).mockResolvedValueOnce({
      ...pending, status: 'PAID', referenceId: 'ref-1', reconciliationEligible: false,
    });
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /بررسی دوبارهٔ وضعیت نامشخص/ }));
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledWith('payment-1'));
    expect(await screen.findByText(/تأیید و تسویه شد/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /بررسی دوبارهٔ وضعیت نامشخص/ })).not.toBeInTheDocument();
  });

  it('does not call the gateway when confirmation is declined', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /بررسی دوبارهٔ وضعیت نامشخص/ }));
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
