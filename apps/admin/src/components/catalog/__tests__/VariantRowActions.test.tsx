import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { ProductVariant } from '@iranyaragh/contracts';
import { VariantRowActions } from '../VariantRowActions';

const mocks = vi.hoisted(() => ({
  changeVariantStatus: vi.fn(),
  updateVariant: vi.fn(),
  updateVariantPrice: vi.fn(),
  getVariantPriceHistory: vi.fn(),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  changeVariantStatus: mocks.changeVariantStatus,
  updateVariant: mocks.updateVariant,
  updateVariantPrice: mocks.updateVariantPrice,
  getVariantPriceHistory: mocks.getVariantPriceHistory,
  createIdempotencyKey: (prefix: string) => `${prefix}-key`,
}));

const variant: ProductVariant = {
  id: 'v1',
  sku: 'LOCK-RED-M',
  title: 'قرمز M',
  status: 'ACTIVE',
  isActive: true,
  version: 2,
  costPrice: { amount: '1500', currency: 'IRR' },
  salePrice: { amount: '2500', currency: 'IRR' },
  attributeValues: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderActions(props: Partial<Parameters<typeof VariantRowActions>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <VariantRowActions variant={variant} onChanged={vi.fn()} {...props} />
    </FeedbackProvider>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByLabelText('اقدامات LOCK-RED-M'));
}

describe('VariantRowActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.changeVariantStatus.mockResolvedValue({ variant });
    mocks.getVariantPriceHistory.mockResolvedValue({ items: [] });
  });

  it('offers edit, price and the status transitions that differ from the current state', () => {
    renderActions();
    openMenu();
    expect(screen.getByText('ویرایش')).toBeInTheDocument();
    expect(screen.getByText('قیمت و تاریخچه')).toBeInTheDocument();
    expect(screen.getByText('غیرفعال‌سازی')).toBeInTheDocument();
    expect(screen.getByText('بایگانی')).toBeInTheDocument();
    expect(screen.queryByText('فعال‌سازی')).not.toBeInTheDocument();
  });

  it('changes the status with an idempotency key and reports success', async () => {
    const onChanged = vi.fn();
    renderActions({ onChanged });
    openMenu();
    fireEvent.click(screen.getByText('غیرفعال‌سازی'));

    await waitFor(() =>
      expect(mocks.changeVariantStatus).toHaveBeenCalledWith(
        'v1',
        { status: 'INACTIVE', expectedVersion: 2 },
        'catalog-variant-status-v1-INACTIVE-key',
      ),
    );
    expect(
      await screen.findByText('وضعیت «LOCK-RED-M» به «غیرفعال» تغییر کرد.'),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows a progress indicator while the status request is in flight', async () => {
    let resolve!: () => void;
    mocks.changeVariantStatus.mockReturnValue(
      new Promise((res) => {
        resolve = () => res({ variant });
      }),
    );
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText('بایگانی'));
    expect(await screen.findByLabelText('در حال تغییر وضعیت')).toBeInTheDocument();
    resolve();
    await screen.findByText('وضعیت «LOCK-RED-M» به «بایگانی‌شده» تغییر کرد.');
  });

  it('surfaces a generic failure for status changes', async () => {
    mocks.changeVariantStatus.mockRejectedValue(new Error('down'));
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText('غیرفعال‌سازی'));
    expect(
      await screen.findByText('تغییر وضعیت تنوع ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });

  it('opens the edit dialog', async () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText('ویرایش'));
    expect(await screen.findByRole('dialog', { name: 'ویرایش تنوع' })).toBeInTheDocument();
  });

  it('opens the price and history dialog', async () => {
    renderActions();
    openMenu();
    fireEvent.click(screen.getByText('قیمت و تاریخچه'));
    expect(
      await screen.findByRole('dialog', { name: 'قیمت و تاریخچهٔ تنوع' }),
    ).toBeInTheDocument();
    expect(mocks.getVariantPriceHistory).toHaveBeenCalledWith('v1', expect.any(AbortSignal));
  });
});