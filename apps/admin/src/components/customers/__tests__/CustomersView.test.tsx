import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CUSTOMERS_MANAGE, CUSTOMERS_READ } from '@/lib/customers/customers-permissions';
import { CustomersView, normalizeCustomersQuery, type CustomersUrlQuery } from '../CustomersView';
import { addressesValidationError } from '../CustomerAddressesDialog';
import { normalizeCustomerMobile } from '../CustomerDialog';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as { permissions: string[] } | null,
  listCustomers: vi.fn(),
  getCustomer: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  replaceAddresses: vi.fn(),
  addNote: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/customers/customers-api', () => ({
  customersApi: { listCustomers: mocks.listCustomers, getCustomer: mocks.getCustomer },
  getCustomer: mocks.getCustomer,
  createCustomer: mocks.createCustomer,
  updateCustomer: mocks.updateCustomer,
  replaceAddresses: mocks.replaceAddresses,
  addNote: mocks.addNote,
  newCustomerCommandKey: (command: string) => `customer-${command}-test-key`,
}));

const customer = {
  id: 'customer-12',
  mobile: '+989121234567',
  firstName: 'زهرا',
  lastName: 'کریمی',
  status: 'ACTIVE' as const,
  version: 3,
  orderCount: 4,
  hasUserAccount: true,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
};

const inactiveCustomer = {
  ...customer,
  id: 'customer-13',
  firstName: 'رضا',
  lastName: 'موسوی',
  status: 'INACTIVE' as const,
  orderCount: 0,
};

const detail = {
  ...customer,
  deactivatedAt: null,
  addresses: [
    {
      id: 'address-1',
      label: 'خانه',
      receiverName: 'زهرا کریمی',
      mobile: '+989121234567',
      provinceCode: 'THR',
      city: 'تهران',
      addressLine: 'خیابان ولیعصر، پلاک ۱۰',
      postalCode: '1234567890',
      isDefault: true,
      createdAt: '2026-08-01T10:00:00.000Z',
      updatedAt: '2026-08-01T10:00:00.000Z',
    },
  ],
  notes: [
    {
      id: 'note-1',
      visibility: 'INTERNAL' as const,
      body: 'مشتری عمده',
      author: { id: 'staff-1', displayNameMasked: 'س*** ا***' },
      createdAt: '2026-09-02T10:00:00.000Z',
    },
  ],
  recentOrders: [
    {
      id: 'order-1',
      number: 'IR-2026-1001',
      status: 'PAID' as const,
      grandTotal: { amount: '1250000', currency: 'IRR' as const },
      paymentStatus: 'PAID' as const,
      fulfillmentStatus: 'DELIVERED' as const,
      placedAt: '2026-09-05T10:00:00.000Z',
    },
  ],
};

const meta = { page: 1, perPage: 10, total: 2, pages: 1 };

function renderView(initialQuery: CustomersUrlQuery = {}) {
  return render(
    <FeedbackProvider>
      <CustomersView initialQuery={initialQuery} />
    </FeedbackProvider>,
  );
}

describe('CustomersView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [CUSTOMERS_READ, CUSTOMERS_MANAGE] };
    mocks.listCustomers.mockResolvedValue({ items: [customer, inactiveCustomer], meta });
    mocks.getCustomer.mockResolvedValue(detail);
    mocks.replace.mockReset();
    mocks.createCustomer.mockReset().mockResolvedValue(undefined);
    mocks.updateCustomer.mockReset().mockResolvedValue(undefined);
    mocks.replaceAddresses.mockReset().mockResolvedValue(undefined);
    mocks.addNote.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => vi.clearAllMocks());

  it('lists staff-directory facts including the full mobile and live total', async () => {
    renderView();

    expect(await screen.findByText('زهرا کریمی')).toBeInTheDocument();
    expect(screen.getAllByText('+989121234567').length).toBeGreaterThan(0);
    expect(screen.getByText('فعال')).toBeInTheDocument();
    expect(screen.getByText('غیرفعال')).toBeInTheDocument();
    expect(screen.getByText('۲ مشتری')).toBeInTheDocument();
  });

  it('shows a forbidden state and never requests data without customers.read', async () => {
    mocks.user = { permissions: [CUSTOMERS_MANAGE] };
    renderView();

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listCustomers).not.toHaveBeenCalled();
  });

  it('hides every mutation control for a read-only operator', async () => {
    mocks.user = { permissions: [CUSTOMERS_READ] };
    renderView();
    await screen.findByText('زهرا کریمی');

    expect(screen.queryByRole('button', { name: /مشتری جدید/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ویرایش/ })).not.toBeInTheDocument();
  });

  it('sends the search term and the status filter to the API', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.change(screen.getByRole('textbox', { name: /جستجو/ }), {
      target: { value: '0912' },
    });
    await waitFor(() => {
      expect(mocks.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: '0912', page: 1 }),
        expect.anything(),
      );
    });

    fireEvent.mouseDown(screen.getByLabelText('فیلتر وضعیت مشتری'));
    fireEvent.click(await screen.findByRole('option', { name: 'غیرفعال' }));
    await waitFor(() => {
      expect(mocks.listCustomers).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'INACTIVE' }),
        expect.anything(),
      );
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      expect.stringContaining('/customers?'),
      expect.anything(),
    );
  });

  it('creates a customer with a normalized mobile and an idempotency key', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getByRole('button', { name: /مشتری جدید/ }));
    fireEvent.change(screen.getByLabelText(/^موبایل/), { target: { value: '0912 345 6789' } });
    fireEvent.change(screen.getByLabelText(/^نام$/), { target: { value: 'سارا' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    await waitFor(() => {
      expect(mocks.createCustomer).toHaveBeenCalledWith(
        { mobile: '09123456789', firstName: 'سارا', lastName: null },
        'customer-create-test-key',
      );
    });
  });

  it('rejects an impossible mobile before calling the API', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getByRole('button', { name: /مشتری جدید/ }));
    fireEvent.change(screen.getByLabelText(/^موبایل/), { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText(/شمارهٔ موبایل باید با ۹ شروع شود/)).toBeInTheDocument();
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it('surfaces a duplicate-mobile conflict as an actionable message', async () => {
    const { ApiClientError } = await import('@/lib/api/client');
    mocks.createCustomer.mockRejectedValueOnce(
      new ApiClientError({
        code: 'CUSTOMER_MOBILE_CONFLICT',
        message: 'duplicated',
        requestId: 'req-1',
        statusCode: 409,
      }),
    );
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getByRole('button', { name: /مشتری جدید/ }));
    fireEvent.change(screen.getByLabelText(/^موبایل/), { target: { value: '09123456789' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیره' }));

    expect(await screen.findByText(/مشتری دیگری با این موبایل ثبت شده است/)).toBeInTheDocument();
  });

  it('loads the detail dialog with addresses, notes and order history', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getAllByRole('button', { name: /جزئیات/ })[0]);
    expect(await screen.findByText('جزئیات مشتری')).toBeInTheDocument();
    expect(await screen.findByText('خانه')).toBeInTheDocument();
    expect(screen.getByText('پیش‌فرض')).toBeInTheDocument();
    expect(screen.getByText('مشتری عمده')).toBeInTheDocument();
    expect(screen.getByText('داخلی')).toBeInTheDocument();

    const history = await screen.findByRole('table', { name: 'سفارش‌های اخیر مشتری' });
    expect(within(history).getByRole('link', { name: 'IR-2026-1001' })).toHaveAttribute(
      'href',
      '/orders/order-1',
    );
    expect(within(history).getByText('۱٬۲۵۰٬۰۰۰ ریال')).toBeInTheDocument();
  });

  it('replaces the whole address set with the current version', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getAllByRole('button', { name: /جزئیات/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /نشانی‌ها و وضعیت/ }));

    expect(await screen.findByText('نشانی‌ها و وضعیت مشتری')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ذخیرهٔ نشانی‌ها/ }));

    expect(mocks.replaceAddresses).toHaveBeenCalledWith(
      'customer-12',
      expect.objectContaining({ expectedVersion: 3 }),
      'customer-addresses-test-key',
    );
  });

  it('appends a note with its visibility and the current version', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getAllByRole('button', { name: /جزئیات/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /افزودن یادداشت/ }));

    fireEvent.change(await screen.findByLabelText(/متن یادداشت/), {
      target: { value: 'تماس گرفته شد' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت یادداشت' }));

    expect(mocks.addNote).toHaveBeenCalledWith(
      'customer-12',
      { expectedVersion: 3, visibility: 'INTERNAL', body: 'تماس گرفته شد' },
      'customer-note-test-key',
    );
  });

  it('warns before recording a customer-visible note', async () => {
    renderView();
    await screen.findByText('زهرا کریمی');

    fireEvent.click(screen.getAllByRole('button', { name: /جزئیات/ })[0]);
    fireEvent.click(await screen.findByRole('button', { name: /افزودن یادداشت/ }));
    fireEvent.click(await screen.findByRole('radio', { name: /قابل مشاهده برای مشتری/ }));

    expect(await screen.findByText(/یادداشت قابل مشاهده برای مشتری است/)).toBeInTheDocument();
  });

  it('normalizes hostile query strings instead of trusting the URL', () => {
    expect(normalizeCustomersQuery({ perPage: '999', page: '0', status: 'NOPE' })).toMatchObject({
      perPage: 10,
      page: 1,
      status: undefined,
    });
    expect(normalizeCustomersQuery({ sortBy: 'DROP TABLE', sortDir: 'sideways' })).toMatchObject({
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
    expect(normalizeCustomersQuery({ hasUserAccount: 'true' }).hasUserAccount).toBe(true);
  });

  it('normalizes the mobile shapes operators actually paste', () => {
    expect(normalizeCustomerMobile('0912 345 6789')).toBe('09123456789');
    expect(normalizeCustomerMobile('+98 (912) 345-6789')).toBe('+989123456789');
  });

  it('requires exactly one default once more than one address exists', () => {
    const base = {
      key: 'k',
      label: 'خانه',
      receiverName: 'زهرا',
      mobile: '09123456789',
      provinceCode: 'THR',
      city: 'تهران',
      addressLine: 'نشانی',
      postalCode: '',
      isDefault: false,
    };
    expect(addressesValidationError([])).toBeNull();
    expect(addressesValidationError([{ ...base, isDefault: true }])).toBeNull();
    expect(addressesValidationError([base, { ...base, key: 'k2' }])).toMatch(/پیش‌فرض/);
    expect(addressesValidationError([{ ...base, isDefault: true, postalCode: '123' }])).toMatch(
      /کد پستی/,
    );
    // Lowercase is normalized and accepted, so a length violation is the real failure.
    expect(addressesValidationError([{ ...base, isDefault: true, provinceCode: 'THRXX' }])).toMatch(
      /کد استان/,
    );
  });
});
