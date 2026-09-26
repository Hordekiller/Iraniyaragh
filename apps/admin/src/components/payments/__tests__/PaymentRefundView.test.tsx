import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentDetailView } from '../PaymentDetailView';

const mocks = vi.hoisted(() => ({
  user: null as { permissions: string[] } | null,
  get: vi.fn(),
  reconcile: vi.fn(),
  refund: vi.fn(),
  newKey: vi.fn(() => 'refund-key-1'),
}));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/lib/payments/payments-api', () => ({
  getPayment: mocks.get,
  reconcilePayment: mocks.reconcile,
  refundPayment: mocks.refund,
  newRefundIdempotencyKey: mocks.newKey,
}));

const paid = {
  id: 'payment-1', order: { id: 'order-1', number: 'IR-1001', status: 'PAID' },
  provider: 'zarinpal', amount: { amount: '100000', currency: 'IRR' },
  refundedTotal: { amount: '0', currency: 'IRR' },
  remainingRefundable: { amount: '100000', currency: 'IRR' },
  status: 'PAID', referenceId: 'ref-1', gatewayEnvironment: 'sandbox',
  createdAt: '2026-09-20T10:00:00.000Z', updatedAt: '2026-09-20T10:01:00.000Z',
  transitions: [], transitionsTruncated: false, reconciliationEligible: false,
  refundEligible: true, refunds: [], refundsTruncated: false,
};

describe('PaymentDetailView refund action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.newKey.mockReturnValue('refund-key-1');
    mocks.user = { permissions: ['payments.read', 'payments.refund'] };
    mocks.get.mockResolvedValue(paid);
    mocks.refund.mockResolvedValue({
      refundId: 'refund-1', paymentId: 'payment-1', orderId: 'order-1',
      amount: { amount: '40000', currency: 'IRR' }, status: 'RECORDED',
      gatewayReferenceId: 'ZR-1', reason: 'CANCELLED_SHIPMENT', note: null,
      paymentStatus: 'PARTIALLY_REFUNDED',
      refundedTotal: { amount: '40000', currency: 'IRR' },
      remainingRefundable: { amount: '60000', currency: 'IRR' },
      createdAt: '2026-09-25T10:00:00.000Z',
    });
  });

  it('hides the command without the refund permission', async () => {
    mocks.user = { permissions: ['payments.read', 'payments.reconcile'] };
    render(<PaymentDetailView paymentId="payment-1" />);
    await screen.findByText(/پرداخت سفارش IR-1001/);
    expect(screen.queryByRole('button', { name: /ثبت استرداد/ })).not.toBeInTheDocument();
  });

  it('hides the command when the server says the payment is not eligible', async () => {
    mocks.get.mockResolvedValue({ ...paid, refundEligible: false, status: 'REFUNDED', remainingRefundable: { amount: '0', currency: 'IRR' } });
    render(<PaymentDetailView paymentId="payment-1" />);
    await screen.findByText(/پرداخت سفارش IR-1001/);
    expect(screen.queryByRole('button', { name: /ثبت استرداد/ })).not.toBeInTheDocument();
  });

  it('shows the server-decided remaining total and never computes the cap itself', async () => {
    mocks.get.mockResolvedValue({ ...paid, refundedTotal: { amount: '40000', currency: 'IRR' }, remainingRefundable: { amount: '60000', currency: 'IRR' } });
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت استرداد/ }));
    expect(await screen.findByText(/قابل استرداد باقی‌مانده/)).toBeInTheDocument();
    expect(await screen.findByText(/حداکثر مبلغ قابل ثبت/)).toBeInTheDocument();
  });

  it('sends the panel reference, the reason and a stable idempotency key', async () => {
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت استرداد/ }));

    fireEvent.change(await screen.findByLabelText(/مبلغ استرداد/), { target: { value: '40000' } });
    fireEvent.change(screen.getByLabelText(/شمارهٔ مرجع تراکنش در پنل درگاه/), { target: { value: 'ZR-1' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /دلیل/ }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('درخواست مشتری'));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت استرداد' }));

    await waitFor(() =>
      expect(mocks.refund).toHaveBeenCalledWith(
        'payment-1',
        { amountMinorUnits: '40000', gatewayReferenceId: 'ZR-1', reason: 'CUSTOMER_REQUEST' },
        'refund-key-1',
      ),
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it('keeps the same idempotency key when the first attempt fails so a retry is safe', async () => {
    mocks.refund.mockRejectedValueOnce(new Error('خطا در ارتباط با سرور'));
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت استرداد/ }));
    fireEvent.change(await screen.findByLabelText(/مبلغ استرداد/), { target: { value: '40000' } });
    fireEvent.change(screen.getByLabelText(/شمارهٔ مرجع تراکنش در پنل درگاه/), { target: { value: 'ZR-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت استرداد' }));

    expect(await screen.findByText('خطا در ارتباط با سرور')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت استرداد' }));
    await waitFor(() => expect(mocks.refund).toHaveBeenCalledTimes(2));
    expect((mocks.refund.mock.calls[0] as unknown[])[2]).toBe((mocks.refund.mock.calls[1] as unknown[])[2]);
  });

  it('refuses to submit an amount that is not a positive integer', async () => {
    render(<PaymentDetailView paymentId="payment-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /ثبت استرداد/ }));
    fireEvent.change(await screen.findByLabelText(/مبلغ استرداد/), { target: { value: '12.5' } });
    fireEvent.change(screen.getByLabelText(/شمارهٔ مرجع تراکنش در پنل درگاه/), { target: { value: 'ZR-1' } });
    expect(screen.getByRole('button', { name: 'ثبت استرداد' })).toBeDisabled();
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('lists the refunds the server returned', async () => {
    mocks.get.mockResolvedValue({
      ...paid,
      refunds: [{
        refundId: 'refund-1', amount: { amount: '40000', currency: 'IRR' }, status: 'RECORDED',
        gatewayReferenceId: 'ZR-1', reason: 'CANCELLED_SHIPMENT', note: 'agent 42',
        createdAt: '2026-09-25T10:00:00.000Z',
      }],
    });
    render(<PaymentDetailView paymentId="payment-1" />);
    expect(await screen.findByRole('table', { name: /استردادهای ثبت‌شدهٔ پرداخت/ })).toBeInTheDocument();
    expect(await screen.findByText('ZR-1')).toBeInTheDocument();
    expect(await screen.findByText('agent 42')).toBeInTheDocument();
  });
});
