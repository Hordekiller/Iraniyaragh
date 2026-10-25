import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ProductDetail } from '@iranyaragh/contracts';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { getProduct, updateProductDescription } from '@/lib/catalog/catalog-api';
import { ProductDescriptionEditor } from '../ProductDescriptionEditor';

vi.mock('@/lib/catalog/catalog-api', () => ({
  updateProductDescription: vi.fn(),
  getProduct: vi.fn(),
  createIdempotencyKey: vi.fn((prefix: string) => `${prefix}-fixed`),
}));

vi.mock('@/components/editor/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (html: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="rte"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  ),
}));

function productDetail(overrides: Partial<ProductDetail> = {}): ProductDetail {
  return {
    id: 'p1',
    name: 'قفل',
    slug: 'lock',
    status: 'PUBLISHED',
    brandId: null,
    categoryId: null,
    brand: null,
    category: null,
    variants: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    description: null,
    version: 3,
    ...overrides,
  };
}

function renderEditor({
  onServerProduct = vi.fn(),
  ...props
}: Partial<ComponentProps<typeof ProductDescriptionEditor>> = {}) {
  return {
    onServerProduct,
    ...render(
      <ProductDescriptionEditor
        productId="p1"
        description={null}
        version={3}
        canWrite
        onServerProduct={onServerProduct}
        {...props}
      />,
    ),
  };
}

function typeContent(html: string) {
  fireEvent.change(screen.getByTestId('rte'), { target: { value: html } });
}

describe('ProductDescriptionEditor', () => {
  beforeEach(() => {
    vi.mocked(updateProductDescription).mockReset();
    vi.mocked(getProduct).mockReset();
    vi.mocked(updateProductDescription).mockResolvedValue({
      product: productDetail(),
    } as never);
  });

  it('seeds the editor from the persisted description and disables save while unchanged', () => {
    renderEditor({ description: '<p>متن قبلی</p>' });

    expect(screen.getByTestId('rte')).toHaveValue('<p>متن قبلی</p>');
    expect(screen.getByTestId('description-save')).toBeDisabled();
    expect(screen.queryByTestId('description-unsaved')).not.toBeInTheDocument();
  });

  it('submits the versioned command and adopts the fresh server product on success', async () => {
    const onServerProduct = vi.fn();
    vi.mocked(updateProductDescription).mockResolvedValue({
      product: productDetail({ description: '<p>متن ذخیره‌شده</p>', version: 4 }),
    } as never);

    renderEditor({ onServerProduct, description: '<p>قدیمی</p>' });
    typeContent('<p>نسخهٔ جدید</p>');
    expect(screen.getByTestId('description-save')).toBeEnabled();
    expect(screen.getByTestId('description-unsaved')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('description-save'));
    expect(screen.getByTestId('description-save')).toBeDisabled();

    await waitFor(() =>
      expect(updateProductDescription).toHaveBeenCalledWith(
        'p1',
        { description: '<p>نسخهٔ جدید</p>', expectedVersion: 3 },
        'product-description-fixed',
      ),
    );

    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();
    expect(onServerProduct).toHaveBeenCalledWith(
      expect.objectContaining({ description: '<p>متن ذخیره‌شده</p>', version: 4 }),
    );
    expect(screen.getByTestId('rte')).toHaveValue('<p>متن ذخیره‌شده</p>');
    expect(screen.getByTestId('description-save')).toBeDisabled();
    expect(screen.queryByTestId('description-unsaved')).not.toBeInTheDocument();
  });

  it('clears the description to null through the clear action', async () => {
    renderEditor({ description: '<p>قدیمی</p>' });

    fireEvent.click(screen.getByTestId('description-clear'));
    expect(screen.getByTestId('rte')).toHaveValue('');

    fireEvent.click(screen.getByTestId('description-save'));
    await waitFor(() =>
      expect(updateProductDescription).toHaveBeenCalledWith(
        'p1',
        { description: null, expectedVersion: 3 },
        expect.any(String),
      ),
    );
  });

  it('replays an ambiguous failure with the same idempotency key', async () => {
    vi.mocked(updateProductDescription)
      .mockRejectedValueOnce(new ApiNetworkError('قطع ارتباط با سرویس'))
      .mockResolvedValueOnce({
        product: productDetail({ description: '<p>متن ذخیره‌شده</p>', version: 4 }),
      } as never);

    renderEditor({ description: null });
    typeContent('<p>متن ذخیره‌شده</p>');
    fireEvent.click(screen.getByTestId('description-save'));

    expect(await screen.findByTestId('description-error')).toBeInTheDocument();
    expect(screen.getByText('قطع ارتباط با سرویس')).toBeInTheDocument();
    expect(screen.getByTestId('rte')).toHaveValue('<p>متن ذخیره‌شده</p>');

    fireEvent.click(screen.getByTestId('description-retry'));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();

    const calls = vi.mocked(updateProductDescription).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toBe(calls[1][2]);
    expect(calls[1][1]).toEqual({ description: '<p>متن ذخیره‌شده</p>', expectedVersion: 3 });
  });

  it('keeps the draft on a stale-version conflict and loads the fresh version on demand', async () => {
    const onServerProduct = vi.fn();
    vi.mocked(updateProductDescription).mockRejectedValueOnce(
      new ApiClientError({
        code: 'STALE_VERSION',
        message: 'نسخهٔ محصول تغییر کرده است.',
        requestId: 'r',
        statusCode: 409,
        details: { expected: 3, actual: 5 },
      }),
    );
    vi.mocked(getProduct).mockResolvedValue({
      product: productDetail({ description: '<p>پاسخ تازهٔ سرویس</p>', version: 5 }),
    } as never);

    renderEditor({ onServerProduct, description: '<p>قدیمی</p>' });
    typeContent('<p>نوشتهٔ کاربر</p>');
    fireEvent.click(screen.getByTestId('description-save'));

    expect(await screen.findByTestId('description-stale')).toBeInTheDocument();
    expect(screen.getByText(/نسخهٔ محصول تغییر کرده است/)).toBeInTheDocument();
    expect(screen.getByTestId('rte')).toHaveValue('<p>نوشتهٔ کاربر</p>');
    expect(screen.queryByTestId('description-retry')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('description-reload'));
    await waitFor(() => expect(getProduct).toHaveBeenCalledWith('p1'));
    expect(await screen.findByTestId('rte')).toHaveValue('<p>پاسخ تازهٔ سرویس</p>');
    expect(onServerProduct).toHaveBeenCalledWith(
      expect.objectContaining({ description: '<p>پاسخ تازهٔ سرویس</p>', version: 5 }),
    );
    expect(screen.queryByTestId('description-stale')).not.toBeInTheDocument();
    expect(screen.queryByTestId('description-unsaved')).not.toBeInTheDocument();
  });

  it('reports a denied save without clobbering the draft', async () => {
    vi.mocked(updateProductDescription).mockRejectedValueOnce(
      new ApiClientError({ code: 'FORBIDDEN', message: 'دسترسی رد شد.', requestId: 'r', statusCode: 403 }),
    );

    renderEditor({ description: null });
    typeContent('<p>نوشتهٔ کاربر</p>');
    fireEvent.click(screen.getByTestId('description-save'));

    expect(await screen.findByText(/مجوز `catalog.write`/)).toBeInTheDocument();
    expect(screen.getByTestId('rte')).toHaveValue('<p>نوشتهٔ کاربر</p>');
    expect(screen.queryByTestId('description-retry')).not.toBeInTheDocument();
    expect(screen.getByTestId('description-unsaved')).toBeInTheDocument();
  });

  it('treats a cancelled request as retryable and reuses the key', async () => {
    vi.mocked(updateProductDescription)
      .mockRejectedValueOnce(new ApiAbortError())
      .mockResolvedValueOnce({
        product: productDetail({ description: '<p>متن ذخیره‌شده</p>', version: 4 }),
      } as never);

    renderEditor({ description: null });
    typeContent('<p>متن ذخیره‌شده</p>');
    fireEvent.click(screen.getByTestId('description-save'));

    expect(await screen.findByTestId('description-error')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('description-retry'));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();

    const calls = vi.mocked(updateProductDescription).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][2]).toBe(calls[1][2]);
  });

  it('shows a read-only preview when the account cannot write catalog data', () => {
    renderEditor({ canWrite: false, description: '<p>فقط خواندنی</p>' });

    expect(screen.queryByTestId('rte')).not.toBeInTheDocument();
    expect(screen.queryByTestId('description-save')).not.toBeInTheDocument();
    expect(screen.getByText('فقط خواندنی')).toBeInTheDocument();
  });

  it('protects the tab from leaving while edits are pending', () => {
    renderEditor({ description: null });

    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    typeContent('<p>ویرایش نشده</p>');
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
  });

  it('does not replace an unsaved draft when a newer server version arrives', () => {
    const onServerProduct = vi.fn();
    const { rerender } = renderEditor({ description: '<p>قدیمی</p>', onServerProduct });
    typeContent('<p>نوشتهٔ من</p>');
    rerender(<ProductDescriptionEditor productId="p1" description="<p>ویرایش دیگر</p>"
      version={4} canWrite onServerProduct={onServerProduct} />);
    expect(screen.getByTestId('rte')).toHaveValue('<p>نوشتهٔ من</p>');
    expect(screen.getByTestId('description-stale')).toBeInTheDocument();
    expect(screen.getByTestId('description-save')).toBeDisabled();
  });

  it('ignores an older product reload after a successful save', async () => {
    vi.mocked(updateProductDescription).mockResolvedValue({ product: productDetail({
      description: '<p>ذخیرهٔ جدید</p>', version: 4,
    }) } as never);
    const onServerProduct = vi.fn();
    const { rerender } = renderEditor({ description: '<p>قدیمی</p>', onServerProduct });
    typeContent('<p>ذخیرهٔ جدید</p>');
    fireEvent.click(screen.getByTestId('description-save'));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();
    rerender(<ProductDescriptionEditor productId="p1" description="<p>پاسخ کهنه</p>"
      version={2} canWrite onServerProduct={onServerProduct} />);
    expect(screen.getByTestId('rte')).toHaveValue('<p>ذخیرهٔ جدید</p>');
    expect(screen.getByTestId('description-saved')).toBeInTheDocument();
  });

  it('reconciles an uncertain save with its original payload while preserving later edits', async () => {
    vi.mocked(updateProductDescription)
      .mockRejectedValueOnce(new ApiNetworkError('نتیجه نامشخص'))
      .mockResolvedValueOnce({ product: productDetail({ description: '<p>تلاش اول</p>', version: 4 }) } as never)
      .mockResolvedValueOnce({ product: productDetail({ description: '<p>تلاش جدید</p>', version: 5 }) } as never);
    renderEditor();
    typeContent('<p>تلاش اول</p>');
    fireEvent.click(screen.getByTestId('description-save'));
    expect(await screen.findByTestId('description-error')).toBeInTheDocument();
    typeContent('<p>تلاش جدید</p>');
    fireEvent.click(screen.getByTestId('description-retry'));
    await waitFor(() => expect(updateProductDescription).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('description-error')).not.toBeInTheDocument());
    const calls = vi.mocked(updateProductDescription).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(screen.getByTestId('rte')).toHaveValue('<p>تلاش جدید</p>');
    expect(screen.queryByTestId('description-saved')).not.toBeInTheDocument();
    expect(screen.getByTestId('description-unsaved')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('description-save'));
    expect(await screen.findByTestId('description-saved')).toBeInTheDocument();
    expect(calls[2][1]).toEqual({ description: '<p>تلاش جدید</p>', expectedVersion: 4 });
  });

  it('does not apply a save response after the product editor is unmounted', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof updateProductDescription>>) => void;
    vi.mocked(updateProductDescription).mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { unmount, onServerProduct } = renderEditor();
    typeContent('<p>در حال ذخیره</p>');
    fireEvent.click(screen.getByTestId('description-save'));
    unmount();
    resolve({ product: productDetail({ version: 4 }) } as never);
    await Promise.resolve();
    expect(onServerProduct).not.toHaveBeenCalled();
  });
});
