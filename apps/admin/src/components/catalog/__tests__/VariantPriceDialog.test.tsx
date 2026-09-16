import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { ProductVariant } from '@iranyaragh/contracts';
import { VariantPriceDialog } from '../VariantPriceDialog';

const mocks = vi.hoisted(() => ({
  getVariantPriceHistory: vi.fn(),
  updateVariantPrice: vi.fn(),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  getVariantPriceHistory: mocks.getVariantPriceHistory,
  updateVariantPrice: mocks.updateVariantPrice,
}));

const variant: ProductVariant = {
  id: 'v1',
  sku: 'LOCK-RED-M',
  title: 'قرمز M',
  status: 'ACTIVE',
  isActive: true,
  version: 4,
  costPrice: { amount: '1500', currency: 'IRR' },
  salePrice: { amount: '2500', currency: 'IRR' },
  attributeValues: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const history = {
  items: [
    {
      id: 'r1' as const,
      effectiveAt: '2026-01-15T10:00:00Z',
      costPrice: { amount: '1200', currency: 'IRR' as const },
      salePrice: { amount: '2000', currency: 'IRR' as const },
      source: 'ADMIN' as const,
      reason: 'تعدیل قیمت',
    },
  ],
};

function renderDialog(props: Partial<Parameters<typeof VariantPriceDialog>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <VariantPriceDialog variant={variant} onSaved={vi.fn()} onClose={vi.fn()} {...props} />
    </FeedbackProvider>,
  );
}

describe('VariantPriceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVariantPriceHistory.mockResolvedValue(history);
    mocks.updateVariantPrice.mockResolvedValue({ variant });
  });

  it('loads and renders the price history rows', async () => {
    renderDialog();
    expect(await screen.findByLabelText('تاریخچهٔ قیمت تنوع')).toBeInTheDocument();
    expect(mocks.getVariantPriceHistory).toHaveBeenCalledWith('v1', expect.any(AbortSignal));
  });

  it('shows an info alert when no history exists', async () => {
    mocks.getVariantPriceHistory.mockResolvedValue({ items: [] });
    renderDialog();
    expect(
      await screen.findByText('هنوز رکوردی از تغییر قیمت ثبت نشده است.'),
    ).toBeInTheDocument();
  });

  it('shows a warning when history fails to load', async () => {
    mocks.getVariantPriceHistory.mockRejectedValue(new Error('down'));
    renderDialog();
    expect(
      await screen.findByText('بارگیری تاریخچهٔ قیمت ناموفق بود.'),
    ).toBeInTheDocument();
  });

  it('submits trimmed prices with an optional reason', async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onSaved, onClose });
    await screen.findByLabelText('تاریخچهٔ قیمت تنوع');
    fireEvent.change(screen.getByLabelText('قیمت خرید (ریال) *'), { target: { value: '1600' } });
    fireEvent.change(screen.getByLabelText('دلیل تغییر'), { target: { value: 'افزایش قیمت' } });
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی قیمت' }));

    await waitFor(() =>
      expect(mocks.updateVariantPrice).toHaveBeenCalledWith('v1', {
        costPrice: { amount: '1600', currency: 'IRR' },
        salePrice: { amount: '2500', currency: 'IRR' },
        reason: 'افزایش قیمت',
        expectedVersion: 4,
      }),
    );
    expect(await screen.findByText(/قیمت تنوع «LOCK-RED-M» به‌روزرسانی شد/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the reason when empty', async () => {
    renderDialog();
    await screen.findByLabelText('تاریخچهٔ قیمت تنوع');
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی قیمت' }));
    await waitFor(() =>
      expect(mocks.updateVariantPrice).toHaveBeenCalledWith(
        'v1',
        expect.not.objectContaining({ reason: expect.anything() }),
      ),
    );
  });

  it('rejects empty amounts before calling the API', async () => {
    const empty = { ...variant, costPrice: { amount: '', currency: 'IRR' as const } };
    render(
      <FeedbackProvider>
        <VariantPriceDialog variant={empty} onSaved={vi.fn()} onClose={vi.fn()} />
      </FeedbackProvider>,
    );
    await screen.findByLabelText('تاریخچهٔ قیمت تنوع');
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی قیمت' }));
    expect(screen.getAllByText('فقط ارقام (بدون جداکننده) مجاز است.')).toHaveLength(1);
    expect(mocks.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('surfaces a generic error on update failure', async () => {
    mocks.updateVariantPrice.mockRejectedValue(new Error('down'));
    renderDialog();
    await screen.findByLabelText('تاریخچهٔ قیمت تنوع');
    fireEvent.click(screen.getByRole('button', { name: 'به‌روزرسانی قیمت' }));
    expect(
      await screen.findByText('به‌روزرسانی قیمت ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });
});