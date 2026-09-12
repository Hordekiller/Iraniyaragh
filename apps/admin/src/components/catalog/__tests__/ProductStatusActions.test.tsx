import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProductListItem } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { changeProductStatus } from '@/lib/catalog/catalog-api';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ProductStatusActions } from '../ProductStatusActions';

vi.mock('@/lib/catalog/catalog-api', () => ({
  changeProductStatus: vi.fn(),
  createIdempotencyKey: (prefix: string) => `${prefix}-test-key`,
}));

const baseProduct: ProductListItem = {
  id: 'p1',
  name: 'قفل دستگیره‌ای',
  slug: 'lock-handle',
  status: 'PUBLISHED',
  brandId: null,
  categoryId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderActions(product: ProductListItem, onChanged = vi.fn()) {
  return {
    onChanged,
    ...render(
      <FeedbackProvider>
        <ProductStatusActions product={product} onChanged={onChanged} />
      </FeedbackProvider>,
    ),
  };
}

function openMenu(product: ProductListItem) {
  fireEvent.click(screen.getByRole('button', { name: `اقدامات ${product.name}` }));
}

describe('ProductStatusActions', () => {
  it('offers unpublish and archive for a published product', () => {
    renderActions(baseProduct);
    openMenu(baseProduct);

    const list = within(screen.getByRole('menu'));
    expect(list.getByText('افزودن به پیش‌نویس')).toBeInTheDocument();
    expect(list.getByText('بایگانی')).toBeInTheDocument();
    expect(list.queryByText('انتشار')).not.toBeInTheDocument();
  });

  it('offers publish for a draft product but no unpublish option', () => {
    renderActions({ ...baseProduct, status: 'DRAFT' });
    openMenu({ ...baseProduct, status: 'DRAFT' });

    expect(screen.getByText('انتشار')).toBeInTheDocument();
    expect(screen.queryByText('افزودن به پیش‌نویس')).not.toBeInTheDocument();
  });

  it('sends the archive command and reports success', async () => {
    const onChanged = vi.fn();
    vi.mocked(changeProductStatus).mockResolvedValue({
      product: { ...baseProduct, status: 'ARCHIVED' },
    } as never);
    renderActions(baseProduct, onChanged);
    openMenu(baseProduct);
    fireEvent.click(screen.getByText('بایگانی'));

    await waitFor(() => expect(changeProductStatus).toHaveBeenCalledWith('p1', 'archive', expect.any(String)));
    expect(await screen.findByText(/وضعیت «قفل دستگیره‌ای» به «بایگانی‌شده» تغییر کرد/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('shows the API error message and does not refresh on failure', async () => {
    const onChanged = vi.fn();
    vi.mocked(changeProductStatus).mockRejectedValue(
      new ApiClientError({ code: 'CONFLICT', message: 'قفل نامعتبر', requestId: 'r', statusCode: 409 }),
    );
    renderActions(baseProduct, onChanged);
    openMenu(baseProduct);
    fireEvent.click(screen.getByText('افزودن به پیش‌نویس'));

    expect(await screen.findByText('قفل نامعتبر')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('shows a generic message for unexpected failures', async () => {
    vi.mocked(changeProductStatus).mockRejectedValue(new Error('boom'));
    renderActions(baseProduct);
    openMenu(baseProduct);
    fireEvent.click(screen.getByText('بایگانی'));

    expect(await screen.findByText('تغییر وضعیت ناموفق بود؛ دوباره تلاش کنید.')).toBeInTheDocument();
  });
});
