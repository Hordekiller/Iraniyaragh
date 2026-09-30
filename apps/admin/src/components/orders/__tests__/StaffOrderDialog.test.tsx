import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiNetworkError } from '@/lib/api/client';
import { StaffOrderDialog } from '../StaffOrderDialog';

const mocks = vi.hoisted(() => ({
  createStaffOrder: vi.fn(),
  searchStaffOrderOptions: vi.fn(),
}));

vi.mock('@/lib/orders/orders-api', () => ({
  createStaffOrder: mocks.createStaffOrder,
  searchStaffOrderOptions: mocks.searchStaffOrderOptions,
}));

const onCreated = vi.fn();
const onClose = vi.fn();
const onRefreshed = vi.fn();

const customerOption = { id: 'customer-1', label: 'رضا محمدی', detail: '+98912*****000' };
const variantOption = { id: 'variant-1', label: 'SKU-1 — صندلی', detail: null };

function renderDialog() {
  return render(
    <StaffOrderDialog
      open
      onClose={onClose}
      onCreated={onCreated}
      onRefreshed={onRefreshed}
    />,
  );
}

/** Pick an option from the first matching server-backed autocomplete. */
async function pickOption(label: RegExp, optionText: RegExp) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value: 'a' } });
  const listbox = await screen.findByRole('listbox', undefined, { timeout: 5000 });
  fireEvent.click(within(listbox).getByRole('option', { name: optionText }));
  await waitFor(() =>
    expect((input as HTMLInputElement).value).not.toBe('a'),
  );
}

/** Fill every field the API requires so the submit button enables. */
async function fillValidOrder() {
  await pickOption(/^مشتری/, /رضا محمدی/);
  await pickOption(/^تنوع کالا/, /SKU-1/);

  fireEvent.mouseDown(screen.getByLabelText(/^استان/));
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'تهران' }));

  fireEvent.change(screen.getByLabelText(/^شهر/), { target: { value: 'تهران' } });
  fireEvent.change(screen.getByLabelText(/^کد پستی/), { target: { value: '1234567890' } });
  fireEvent.change(screen.getByLabelText(/^نشانی/), { target: { value: 'خیابان ولیعصر' } });
  fireEvent.change(screen.getByLabelText(/^نام گیرنده/), { target: { value: 'خریدار' } });
  fireEvent.change(screen.getByLabelText(/^موبایل/), { target: { value: '09120000000' } });
}

function submitButton() {
  return screen.getByRole('button', { name: 'ثبت سفارش' });
}

describe('StaffOrderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchStaffOrderOptions.mockImplementation(
      async (query: { kind: string }) => ({
        items: query.kind === 'customer' ? [customerOption] : [variantOption],
        count: 1,
      }),
    );
  });

  it('keeps submit disabled until the required fields are complete', async () => {
    renderDialog();
    expect(submitButton()).toBeDisabled();

    await pickOption(/^مشتری/, /رضا محمدی/);
    await pickOption(/^تنوع کالا/, /SKU-1/);
    // The address is still empty, so the order must not be submittable.
    expect(submitButton()).toBeDisabled();
  });

  it('searches the customer through the orders-scoped lookup', async () => {
    renderDialog();
    await pickOption(/^مشتری/, /رضا محمدی/);

    expect(mocks.searchStaffOrderOptions).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'customer' }),
    );
  });

  it('creates the order and reports the new id to the caller', async () => {
    mocks.createStaffOrder.mockResolvedValue({
      order: { id: 'order-9', status: 'PENDING_PAYMENT' },
      replayed: false,
      reservations: [],
    });
    renderDialog();
    await fillValidOrder();

    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('order-9'));
    expect(mocks.createStaffOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-1',
        lines: [{ variantId: 'variant-1', quantity: 1 }],
        address: expect.objectContaining({ provinceCode: 'THR', city: 'تهران' }),
      }),
      expect.any(String),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('never sends a money field of its own', async () => {
    mocks.createStaffOrder.mockResolvedValue({
      order: { id: 'order-money' },
      replayed: false,
      reservations: [],
    });
    renderDialog();
    await fillValidOrder();

    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(submitButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [payload] = mocks.createStaffOrder.mock.calls[0];
    expect(payload).not.toHaveProperty('discount');
    expect(payload).not.toHaveProperty('total');
  });

  it('blocks a blind retry after a network error until the list is refreshed', async () => {
    mocks.createStaffOrder.mockRejectedValue(new ApiNetworkError('offline'));

    renderDialog();
    await fillValidOrder();
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });

    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(screen.getAllByText(/نامشخص است/).length).toBeGreaterThan(0),
    );

    // The outcome is unknown, so the operator must look before resubmitting.
    expect(submitButton()).toBeDisabled();
    expect(mocks.createStaffOrder).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'تازه‌سازی فهرست' }));
    await waitFor(() => expect(onRefreshed).toHaveBeenCalled());
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it('reuses the same Idempotency-Key once the operator has refreshed', async () => {
    mocks.createStaffOrder
      .mockRejectedValueOnce(new ApiNetworkError('offline'))
      .mockResolvedValueOnce({
        order: { id: 'order-10' },
        replayed: true,
        reservations: [],
      });

    renderDialog();
    await fillValidOrder();
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });

    fireEvent.click(submitButton());
    await waitFor(() =>
      expect(screen.getAllByText(/نامشخص است/).length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole('button', { name: 'تازه‌سازی فهرست' }));
    await waitFor(() => expect(submitButton()).toBeEnabled());
    fireEvent.click(submitButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('order-10'));
    const keys = mocks.createStaffOrder.mock.calls.map((call) => call[1]);
    // A blind retry with a new key would create a duplicate order.
    expect(keys[0]).toBe(keys[1]);
  });

  it('adds and removes line rows', async () => {
    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'افزودن قلم' }));
    await waitFor(() =>
      expect(screen.getAllByLabelText(/^تنوع کالا/)).toHaveLength(2),
    );

    fireEvent.click(screen.getAllByLabelText('حذف قلم')[1]);
    expect(screen.getAllByLabelText(/^تنوع کالا/)).toHaveLength(1);
  });

  it('disables line removal when only one row is left', () => {
    renderDialog();
    expect(screen.getByLabelText('حذف قلم')).toBeDisabled();
  });

  it('surfaces a server-side stock conflict as an error', async () => {
    const { ApiClientError } = await import('@/lib/api/client');
    mocks.createStaffOrder.mockRejectedValue(
      new ApiClientError({
        code: 'INSUFFICIENT_STOCK',
        message: 'موجودی کافی نیست',
        statusCode: 409,
        requestId: 'req-1',
      }),
    );

    renderDialog();
    await fillValidOrder();
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByText('موجودی کافی نیست')).toBeInTheDocument(), {
      timeout: 5000,
    });
    expect(onCreated).not.toHaveBeenCalled();
    // A definite rejection is not an ambiguous result, so retrying is allowed.
    await waitFor(() => expect(submitButton()).toBeEnabled());
  });

  it('shows a guest-order refusal as the server reported it', async () => {
    const { ApiClientError } = await import('@/lib/api/client');
    mocks.createStaffOrder.mockRejectedValue(
      new ApiClientError({
        code: 'GUEST_ORDER_UNSUPPORTED',
        message: 'سفارش بدون مشتری پشتیبانی نمی‌شود',
        statusCode: 422,
        requestId: 'req-2',
      }),
    );

    renderDialog();
    await fillValidOrder();
    await waitFor(() => expect(submitButton()).toBeEnabled(), { timeout: 5000 });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText('سفارش بدون مشتری پشتیبانی نمی‌شود')).toBeInTheDocument(),
    );
  });

  it('explains that a guest order needs a customer record', () => {
    renderDialog();
    expect(
      screen.getByText(/سفارش بدون مشتری ثبت نمی‌شود/),
    ).toBeInTheDocument();
  });
});
