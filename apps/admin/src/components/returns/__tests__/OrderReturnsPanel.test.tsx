import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderReturnView, ReturnEligibility } from '@iranyaragh/contracts';
import { ApiNetworkError } from '@/lib/api/client';
import * as api from '@/lib/returns/returns-api';
import { OrderReturnsPanel } from '../OrderReturnsPanel';

const auth = vi.hoisted(() => ({ permissions: ['returns.read', 'returns.manage', 'payments.refund', 'inventory.read'] as string[] }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1', permissions: auth.permissions } }) }));
vi.mock('@/lib/returns/returns-api', () => ({ getReturnEligibility: vi.fn(), createOrderReturn: vi.fn(), listReturns: vi.fn(), recordReturnRefund: vi.fn() }));
vi.mock('@/lib/inventory/warehouses-api', () => ({
  listWarehouses: vi.fn(async () => ({ items: [{ id: 'w1', name: 'انبار مرکزی' }], count: 1 })),
  listLocations: vi.fn(async () => ({ items: [{ id: 'l1', code: 'A1', name: 'قفسه A1' }], count: 1 })),
}));

const money = (amount: string) => ({ amount, currency: 'IRR' as const });
const eligible: ReturnEligibility = {
  orderId: 'o1', orderNumber: 'A-1', eligible: true, reason: null, windowKind: 'IN_PERSON', policyRevision: 'returns-v1',
  invoiceIssuedAt: '2026-11-09T08:00:00.000Z', deadlineAt: '2026-11-11T20:29:59.999Z', shippingAmount: money('0'),
  lines: [{ orderItemId: 'i1', sku: 'SKU-1', title: 'قفل', orderedQuantity: 3, returnedQuantity: 0, remainingQuantity: 3, unitPrice: money('1000'), netLineAmount: money('3000') }],
};
const view = (over: Partial<OrderReturnView> = {}): OrderReturnView => ({
  id: 'r1', orderId: 'o1', orderNumber: 'A-1', number: 'A-1-R1', sequence: 1, windowKind: 'IN_PERSON', policyRevision: 'returns-v1',
  invoiceIssuedAt: '2026-11-09T08:00:00.000Z', deadlineAt: '2026-11-11T20:29:59.999Z', returnedAt: '2026-11-10T08:00:00.000Z',
  merchandiseRefund: money('1000'), shippingRefund: money('0'), refundDue: money('1000'), refunded: money('0'), refundRemaining: money('1000'),
  reason: 'x', note: null, lines: [], createdAt: '2026-11-10T08:00:00.000Z', ...over,
});

const mount = () => render(<OrderReturnsPanel orderId="o1" orderNumber="A-1" onChanged={vi.fn(async () => undefined)} />);

describe('OrderReturnsPanel', () => {
  beforeEach(() => {
    auth.permissions = ['returns.read', 'returns.manage', 'payments.refund', 'inventory.read'];
    vi.mocked(api.getReturnEligibility).mockReset().mockResolvedValue(eligible);
    vi.mocked(api.listReturns).mockReset().mockResolvedValue({ items: [], meta: { page: 1, perPage: 100, total: 0, pages: 1 } });
    vi.mocked(api.createOrderReturn).mockReset().mockResolvedValue(view());
    vi.mocked(api.recordReturnRefund).mockReset().mockResolvedValue({ orderReturn: view(), refundId: 'rf1', paymentStatus: 'REFUNDED' });
  });

  it('renders nothing and calls no API without returns.read', () => {
    auth.permissions = ['orders.read'];
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
    expect(api.getReturnEligibility).not.toHaveBeenCalled();
  });

  it('states the approved policy and the window, and hides the form when the window is closed', async () => {
    vi.mocked(api.getReturnEligibility).mockResolvedValue({ ...eligible, eligible: false, reason: 'WINDOW_CLOSED' });
    mount();
    expect(await screen.findByText(/مهلت مرجوعی به پایان رسیده/)).toBeInTheDocument();
    expect(screen.getByText(/۲ روز کاری برای تحویل حضوری و ۱ هفته برای شهرهای دیگر/)).toBeInTheDocument();
    expect(screen.getByText(/هیچ پولی جابه‌جا نمی‌کند/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'ثبت مرجوعی' })).not.toBeInTheDocument();
  });

  it('tells staff when recording is switched off, hides the form but keeps settling refunds available', async () => {
    vi.mocked(api.getReturnEligibility).mockResolvedValue({ ...eligible, eligible: false, reason: 'RETURNS_DISABLED' });
    vi.mocked(api.listReturns).mockResolvedValue({ items: [view()], meta: { page: 1, perPage: 100, total: 1, pages: 1 } });
    mount();
    expect(await screen.findByText(/ثبت مرجوعی جدید در «تنظیمات ← مهلت مرجوعی و تعطیلات» غیرفعال است/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'ثبت مرجوعی' })).not.toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'ثبت استرداد دستی' })).toBeInTheDocument();
  });

  it('explains an unclassified shipping method instead of guessing a window', async () => {
    vi.mocked(api.getReturnEligibility).mockResolvedValue({ ...eligible, eligible: false, reason: 'METHOD_UNCLASSIFIED', windowKind: null, deadlineAt: null });
    mount();
    expect(await screen.findByText(/هنوز در «تنظیمات ارسال» به‌عنوان حضوری یا شهر دیگر مشخص نشده/)).toBeInTheDocument();
  });

  it('does not offer recording without returns.manage', async () => {
    auth.permissions = ['returns.read'];
    mount();
    await screen.findByText(/نوع مهلت/);
    expect(screen.queryByRole('form', { name: 'ثبت مرجوعی' })).not.toBeInTheDocument();
  });

  it('blocks submission until quantity, reason, destination and confirmation are valid', async () => {
    mount();
    const form = await screen.findByRole('form', { name: 'ثبت مرجوعی' });
    const submit = within(form).getByRole('button', { name: 'ثبت مرجوعی' });
    expect(submit).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/تعداد مرجوعی SKU-1/), { target: { value: '4' } }); // more than remaining
    fireEvent.change(within(form).getByLabelText(/دلیل مرجوعی/), { target: { value: 'منصرف شد' } });
    fireEvent.click(within(form).getByRole('checkbox'));
    expect(submit).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/تعداد مرجوعی SKU-1/), { target: { value: '2' } });
    expect(submit).toBeDisabled(); // restock needs a warehouse and location
  });

  it('records a restocked return with its destination and keeps one idempotency key across an uncertain retry', async () => {
    vi.mocked(api.createOrderReturn).mockRejectedValueOnce(new ApiNetworkError('lost'));
    mount();
    const form = await screen.findByRole('form', { name: 'ثبت مرجوعی' });
    fireEvent.change(within(form).getByLabelText(/تعداد مرجوعی SKU-1/), { target: { value: '2' } });
    fireEvent.mouseDown(await within(form).findByRole('combobox', { name: /انبار دریافت/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'انبار مرکزی' }));
    fireEvent.mouseDown(await within(form).findByRole('combobox', { name: /محل دریافت/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'قفسه A1' }));
    fireEvent.change(within(form).getByLabelText(/دلیل مرجوعی/), { target: { value: 'منصرف شد' } });
    fireEvent.click(within(form).getByRole('checkbox'));
    fireEvent.click(within(form).getByRole('button', { name: 'ثبت مرجوعی' }));

    await screen.findByText(/نتیجهٔ ثبت هنوز مشخص نیست/);
    fireEvent.click(screen.getByRole('button', { name: 'بررسی و تکرار همان ثبت' }));
    await waitFor(() => expect(api.createOrderReturn).toHaveBeenCalledTimes(2));
    const [first, second] = vi.mocked(api.createOrderReturn).mock.calls;
    expect(first![1]).toEqual({ reason: 'منصرف شد', lines: [{ orderItemId: 'i1', quantity: 2, disposition: 'RESTOCK', warehouseId: 'w1', locationId: 'l1' }] });
    expect(second![1]).toEqual(first![1]);
    expect(second![2]).toBe(first![2]); // same key, so the server cannot record it twice
    await screen.findByText(/پولی جابه‌جا نشده است/);
  });

  it('shows the refund form only with payments.refund and refuses amounts above what is still due', async () => {
    vi.mocked(api.listReturns).mockResolvedValue({ items: [view()], meta: { page: 1, perPage: 100, total: 1, pages: 1 } });
    mount();
    const form = await screen.findByRole('form', { name: 'ثبت استرداد دستی' });
    expect(within(form).getByText(/هیچ وجهی منتقل نمی‌کند/)).toBeInTheDocument();
    fireEvent.mouseDown(within(form).getByRole('combobox', { name: /مرجوعی دارای مبلغ باقی‌مانده/ }));
    fireEvent.click(await screen.findByRole('option', { name: /A-1-R1/ }));
    fireEvent.change(within(form).getByLabelText(/شناسهٔ مرجع استرداد/), { target: { value: 'ZP-1' } });
    fireEvent.change(within(form).getByLabelText(/دلیل ثبت/), { target: { value: 'تسویه مرجوعی' } });
    fireEvent.click(within(form).getByRole('checkbox'));
    const submit = within(form).getByRole('button', { name: 'ثبت سند استرداد' });
    expect(submit).toBeEnabled();
    fireEvent.change(within(form).getByLabelText(/مبلغ واقعاً مسترد‌شده/), { target: { value: '1001' } });
    expect(submit).toBeDisabled();
    fireEvent.change(within(form).getByLabelText(/مبلغ واقعاً مسترد‌شده/), { target: { value: '1000' } });
    fireEvent.click(submit);
    await waitFor(() => expect(api.recordReturnRefund).toHaveBeenCalledWith('r1', { amountMinorUnits: '1000', gatewayReferenceId: 'ZP-1', reason: 'تسویه مرجوعی' }, expect.stringMatching(/^return-/)));
  });

  it('hides the refund form without payments.refund', async () => {
    auth.permissions = ['returns.read', 'returns.manage'];
    vi.mocked(api.listReturns).mockResolvedValue({ items: [view()], meta: { page: 1, perPage: 100, total: 1, pages: 1 } });
    mount();
    await screen.findByRole('table', { name: 'مرجوعی‌های ثبت‌شده این سفارش' });
    expect(screen.queryByRole('form', { name: 'ثبت استرداد دستی' })).not.toBeInTheDocument();
  });
});
