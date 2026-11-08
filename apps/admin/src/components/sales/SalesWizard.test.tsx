import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError } from '@/lib/api/client';
import { createStaffOrder } from '@/lib/orders/orders-api';
import { SalesWizard } from './SalesWizard';

const auth = vi.hoisted(() => ({ user: { userId: 'staff', permissions: ['orders.manage'] } as { userId: string; permissions: string[] }, isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('@/lib/orders/orders-api', () => ({ createStaffOrder: vi.fn(), searchStaffOrderOptions: vi.fn() }));
vi.mock('@/components/ui/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
// The real picker talks to the search API; a minimal stand-in keeps this test about the wizard.
vi.mock('@/components/orders/StaffOrderOptionPicker', () => ({
  StaffOrderOptionPicker: ({ kind, label, onChange }: { kind: string; label: string; onChange: (value: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ id: `${kind}-1`, label: kind === 'customer' ? 'مشتری نمونه' : 'لولا ۱۰۰', detail: null })}>انتخاب {label}</button>
  ),
}));

const order = {
  id: 'o1', number: 'ORD-1', totals: { total: { amount: '1500000', currency: 'IRR' } }, reservationExpiresAt: '2026-11-20T10:00:00.000Z',
} as never;
const next = () => fireEvent.click(screen.getByRole('button', { name: 'بعدی' }));

function fillAddress() {
  fireEvent.mouseDown(screen.getByLabelText(/^استان/));
  fireEvent.click(screen.getAllByRole('option', { name: 'تهران' })[0]!);
  fireEvent.change(screen.getByLabelText(/^شهر/), { target: { value: 'تهران' } });
  fireEvent.change(screen.getByLabelText(/^نشانی کامل/), { target: { value: 'خیابان ولیعصر' } });
  fireEvent.change(screen.getByLabelText(/^کد پستی/), { target: { value: '۱۲۳۴۵۶۷۸۹۰' } });
  fireEvent.change(screen.getByLabelText(/^نام گیرنده/), { target: { value: 'زهرا' } });
  fireEvent.change(screen.getByLabelText(/^موبایل گیرنده/), { target: { value: '۰۹۱۲۳۴۵۶۷۸۹' } });
}
function reachReview() {
  render(<SalesWizard />);
  fireEvent.click(screen.getByRole('button', { name: 'انتخاب مشتری' })); next();
  fireEvent.click(screen.getByRole('button', { name: 'انتخاب کالا' })); next();
  fillAddress(); next();
}

describe('SalesWizard', () => {
  beforeEach(() => { auth.user = { userId: 'staff', permissions: ['orders.manage'] }; vi.mocked(createStaffOrder).mockReset(); });

  it('requires the order-management permission', () => {
    auth.user = { userId: 'staff', permissions: ['orders.read'] };
    render(<SalesWizard />);
    expect(screen.getByRole('alert')).toHaveTextContent('مدیریت سفارش‌ها');
    expect(screen.queryByRole('button', { name: 'بعدی' })).not.toBeInTheDocument();
  });

  it('does not advance past a step until its data is valid, and says what is missing', () => {
    render(<SalesWizard />);
    next();
    expect(screen.getByText('برای ادامه یک مشتری انتخاب کنید.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب مشتری' })); next();
    next();
    expect(screen.getByText('کالا را انتخاب کنید.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کالا' })); next();
    next();
    expect(screen.getByText('کد پستی باید ۱۰ رقم باشد.')).toBeVisible();
    expect(screen.getByText('استان را انتخاب کنید.')).toBeVisible();
  });

  it('blocks the same product twice', () => {
    render(<SalesWizard />);
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب مشتری' })); next();
    fireEvent.click(screen.getByRole('button', { name: 'انتخاب کالا' }));
    fireEvent.click(screen.getByRole('button', { name: 'افزودن قلم' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'انتخاب کالا' })[1]!);
    next();
    expect(screen.getAllByText(/دو بار آمده است/).length).toBeGreaterThan(0);
  });

  it('submits normalized data once and shows the server total and the next steps', async () => {
    vi.mocked(createStaffOrder).mockResolvedValue({ order, replayed: false } as never);
    reachReview();
    expect(screen.getByText(/مبلغ کل را سرور/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش' }));
    expect(await screen.findByText(/ORD-1/)).toBeVisible();
    const [input, key] = vi.mocked(createStaffOrder).mock.calls[0]!;
    expect(input).toMatchObject({ customerId: 'customer-1', lines: [{ variantId: 'variant-1', quantity: 1 }], address: { provinceCode: 'THR', postalCode: '1234567890', mobile: '09123456789' } });
    expect(key).toMatch(/^staff-order-/u);
    expect(screen.getByRole('link', { name: 'مشاهدهٔ سفارش و صدور فاکتور' })).toHaveAttribute('href', '/orders/o1');
    expect(createStaffOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps the same retry key after an unknown outcome and never claims success', async () => {
    vi.mocked(createStaffOrder).mockRejectedValueOnce(new ApiNetworkError('lost')).mockResolvedValueOnce({ order, replayed: true } as never);
    reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت سفارش' }));
    expect(await screen.findByText(/نتیجهٔ ثبت نامشخص است/)).toBeVisible();
    expect(screen.queryByText(/ORD-1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره با همان درخواست' }));
    await waitFor(() => expect(screen.getByText(/ORD-1/)).toBeVisible());
    const keys = vi.mocked(createStaffOrder).mock.calls.map((call) => call[1]);
    expect(keys[0]).toBe(keys[1]);
  });
});
