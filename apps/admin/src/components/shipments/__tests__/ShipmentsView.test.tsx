import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { SHIPMENTS_READ } from '@/lib/shipments/shipments-permissions';
import { ShipmentsView, type ShipmentsUrlQuery } from '../ShipmentsView';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as { permissions: string[] } | null,
  listShipments: vi.fn(),
  getShipment: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/shipments/shipments-api', () => ({
  shipmentsApi: { listShipments: mocks.listShipments, getShipment: mocks.getShipment },
  getShipment: mocks.getShipment,
}));

const shipment = {
  id: 'shipment-77',
  orderId: 'order-1042',
  orderNumber: 'IR-2026-1042',
  status: 'SHIPPED' as const,
  carrier: 'پست پیشتاز',
  trackingCode: 'TRK-9911',
  itemCount: 2,
  totalQuantity: 3,
  city: 'تهران',
  customer: { id: 'customer-1', displayNameMasked: 'م*** ر***', mobileMasked: '0912*****67' },
  dispatchedAt: '2026-09-20T10:00:00.000Z',
};

const detail = {
  ...shipment,
  address: {
    provinceCode: 'THR',
    city: 'تهران',
    addressMasked: 'خیابان ***، پلاک **',
    postalCodeMasked: '*****671',
    recipientMasked: 'م*** ر***',
    mobileMasked: '0912*****67',
  },
  dispatchedBy: { id: 'staff-1', displayNameMasked: 'س*** ا***' },
  lines: [
    { orderItemId: 'item-1', sku: 'DEMO-SCR-12V-S1', productTitle: 'پیچگوشتی برقی دمو', variantTitle: null, quantity: 3 },
  ],
  timeline: [
    {
      id: 'transition-1',
      from: 'READY_TO_SHIP' as const,
      to: 'SHIPPED' as const,
      kind: 'DISPATCH' as const,
      proofReference: null,
      actor: { id: 'staff-1', displayNameMasked: 'س*** ا***' },
      requestId: 'req-1',
      createdAt: '2026-09-20T10:00:00.000Z',
    },
    {
      id: 'transition-2',
      from: 'SHIPPED' as const,
      to: 'DELIVERED' as const,
      kind: 'DELIVERY_PROOF' as const,
      proofReference: 'PROOF-4471',
      actor: { id: 'staff-2', displayNameMasked: null },
      requestId: 'req-2',
      createdAt: '2026-09-22T08:30:00.000Z',
    },
  ],
};

const meta = { page: 1, perPage: 10, total: 1, pages: 1 };

function renderView(initialQuery: ShipmentsUrlQuery = {}) {
  return render(
    <FeedbackProvider>
      <ShipmentsView initialQuery={initialQuery} />
    </FeedbackProvider>,
  );
}

describe('ShipmentsView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [SHIPMENTS_READ] };
    mocks.listShipments.mockResolvedValue({ items: [shipment], meta });
    mocks.getShipment.mockResolvedValue(detail);
    mocks.replace.mockReset();
  });

  afterEach(() => vi.clearAllMocks());

  it('renders the persisted shipment facts and the live total', async () => {
    renderView();

    expect(await screen.findByRole('link', { name: 'IR-2026-1042' })).toHaveAttribute('href', '/orders/order-1042');
    expect(screen.getByText('پست پیشتاز')).toBeInTheDocument();
    expect(screen.getByText('TRK-9911')).toBeInTheDocument();
    expect(screen.getByText('تهران')).toBeInTheDocument();
    expect(screen.getByText('ارسال‌شده')).toBeInTheDocument();
    expect(screen.getByText('م*** ر***')).toBeInTheDocument();
    expect(screen.getByText(/۳ عدد در ۲ قلم کالا/)).toBeInTheDocument();
    expect(screen.getByText('۱ ارسال')).toBeInTheDocument();
  });

  it('shows a forbidden state and never requests data without shipments.read', async () => {
    mocks.user = { permissions: [] };
    renderView();

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(mocks.listShipments).not.toHaveBeenCalled();
  });

  it('states the read-only API boundary truthfully', async () => {
    renderView();

    await screen.findByRole('link', { name: 'IR-2026-1042' });
    expect(screen.getByText(/API خواندنی ارسال‌ها/)).toBeInTheDocument();
  });

  it('loads the masked detail on demand and links back to the order', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));

    const dialog = await screen.findByRole('dialog');
    expect(mocks.getShipment).toHaveBeenCalledWith('shipment-77', expect.any(AbortSignal));
    expect(within(dialog).getByText('نشانی: خیابان ***، پلاک **')).toBeInTheDocument();
    expect(within(dialog).getByText('کد پستی: *****671')).toBeInTheDocument();
    expect(within(dialog).getByText('س*** ا***')).toBeInTheDocument();
    expect(within(dialog).getByText('DEMO-SCR-12V-S1')).toBeInTheDocument();
    expect(within(dialog).getByText('پیچگوشتی برقی دمو')).toBeInTheDocument();
  });

  it('renders the persisted event timeline with the delivery proof', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('ثبت ارسال')).toBeInTheDocument();
    expect(within(dialog).getByText('تأیید تحویل با مدرک')).toBeInTheDocument();
    expect(within(dialog).getByText('آماده ارسال ← ارسال‌شده')).toBeInTheDocument();
    expect(within(dialog).getByText('ارسال‌شده ← تحویل‌شده')).toBeInTheDocument();
    expect(within(dialog).getByText('مدرک تحویل: PROOF-4471')).toBeInTheDocument();
    expect(within(dialog).getAllByText('ثبت‌کننده: س*** ا***')).toHaveLength(1);
    expect(within(dialog).getByText('ثبت‌کننده: سیستم')).toBeInTheDocument();
  });

  it('states an honest empty timeline instead of inventing events', async () => {
    mocks.getShipment.mockResolvedValue({ ...detail, timeline: [] });
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByText('رویدادی برای این ارسال ثبت نشده است.')).toBeInTheDocument();
  });

  it('never renders a raw PII value in the detail dialog', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));
    await screen.findByRole('dialog');

    expect(screen.queryByText('09121234567')).not.toBeInTheDocument();
  });

  it('reports a detail failure without crashing the list', async () => {
    mocks.getShipment.mockRejectedValue(new Error('ارسال یافت نشد.'));
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }));

    expect(await screen.findByText('ارسال یافت نشد.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'IR-2026-1042', hidden: true })).toBeInTheDocument();
  });

  it('debounces the tracking-code search into a URL update', async () => {
    renderView();

    const searchBox = await screen.findByRole('textbox', { name: 'جستجو' });
    expect(searchBox).toHaveAttribute('placeholder', 'جستجو با کد رهگیری…');
    fireEvent.change(searchBox, { target: { value: 'TRK-99' } });

    await waitFor(
      () => expect(mocks.replace).toHaveBeenCalledWith('/shipments?trackingCode=TRK-99', { scroll: false }),
      { timeout: 2000 },
    );
  });

  it('updates the URL with a contract shipment status', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'فیلتر وضعیت ارسال' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('تحویل‌شده'));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/shipments?status=DELIVERED', { scroll: false }));
  });

  it('commits the carrier filter on blur and returns to the first page', async () => {
    renderView({ page: '3' });
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    const carrier = screen.getByRole('textbox', { name: 'فیلتر شرکت حمل' });
    fireEvent.change(carrier, { target: { value: ' تیپاکس ' } });
    fireEvent.blur(carrier);

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/shipments?carrier=%D8%AA%DB%8C%D9%BE%D8%A7%DA%A9%D8%B3', { scroll: false }),
    );
  });

  it('widens the dispatch date inputs to real UTC day bounds', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.change(screen.getByLabelText('فیلتر تاریخ شروع ارسال'), {
      target: { value: '2026-09-01' },
    });

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/shipments?dispatchedFrom=2026-09-01T00%3A00%3A00.000Z',
        { scroll: false },
      ),
    );
  });

  it('includes the selected end day up to its last instant', async () => {
    renderView();
    await screen.findByRole('link', { name: 'IR-2026-1042' });

    fireEvent.change(screen.getByLabelText('فیلتر تاریخ پایان ارسال'), {
      target: { value: '2026-09-21' },
    });

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        '/shipments?dispatchedTo=2026-09-21T23%3A59%3A59.999Z',
        { scroll: false },
      ),
    );
  });

  it('forwards the date range from the URL into the API query', async () => {
    renderView({ dispatchedFrom: '2026-09-01T00:00:00.000Z', dispatchedTo: '2026-09-21T23:59:59.999Z' });

    await screen.findByRole('link', { name: 'IR-2026-1042' });
    expect(mocks.listShipments).toHaveBeenCalledWith(
      expect.objectContaining({
        dispatchedFrom: '2026-09-01T00:00:00.000Z',
        dispatchedTo: '2026-09-21T23:59:59.999Z',
      }),
      expect.any(AbortSignal),
    );
  });

  it('maps initial URL values into the API query', async () => {
    renderView({ page: '2', perPage: '25', status: 'DELIVERED', carrier: 'post', sortBy: 'carrier', sortDir: 'asc' });

    await screen.findByRole('link', { name: 'IR-2026-1042' });
    expect(mocks.listShipments).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        perPage: 25,
        status: 'DELIVERED',
        carrier: 'post',
        sortBy: 'carrier',
        sortDir: 'asc',
      }),
      expect.any(AbortSignal),
    );
  });

  it('ignores unknown URL values instead of forwarding them to the API', async () => {
    renderView({ page: '0', perPage: '999', status: 'CANCELLED', sortBy: 'trackingCode' });

    await waitFor(() =>
      expect(mocks.listShipments).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          perPage: 10,
          status: undefined,
          sortBy: 'dispatchedAt',
          sortDir: 'desc',
        }),
        expect.any(AbortSignal),
      ),
    );
  });

  it('shows the contextual empty state when the filters match nothing', async () => {
    mocks.listShipments.mockResolvedValue({ items: [], meta: { page: 1, perPage: 10, total: 0, pages: 0 } });
    renderView({ status: 'RETURNED' });

    expect(await screen.findByText('ارسالی یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/فیلترهای فعلی/)).toBeInTheDocument();
  });

  it('shows the plain empty state when nothing was ever shipped', async () => {
    mocks.listShipments.mockResolvedValue({ items: [], meta: { page: 1, perPage: 10, total: 0, pages: 0 } });
    renderView();

    expect(await screen.findByText('ارسالی یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/هنوز ارسالی ثبت نشده است/)).toBeInTheDocument();
  });

  it('surfaces a list failure inside the table', async () => {
    mocks.listShipments.mockRejectedValue(new Error('سرویس ارسال‌ها در دسترس نیست.'));
    renderView();

    expect(await screen.findByText('سرویس ارسال‌ها در دسترس نیست.')).toBeInTheDocument();
  });
});
