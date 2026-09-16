import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import type { ProductDetail } from '@iranyaragh/contracts';
import { AttributeConfigEditor } from '../AttributeConfigEditor';

const mocks = vi.hoisted(() => ({
  configureProductAttributes: vi.fn(),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  configureProductAttributes: mocks.configureProductAttributes,
}));

const product: ProductDetail = {
  id: 'p1',
  name: 'قفل دستگیره‌ای',
  slug: 'lock-handle',
  status: 'PUBLISHED',
  version: 3,
  brandId: 'b1',
  categoryId: 'c1',
  description: null,
  brand: null,
  category: null,
  updatedAt: '2026-01-01T00:00:00Z',
  createdAt: '2026-01-01T00:00:00Z',
  attributes: [
    { attributeCode: 'color', attributeName: 'رنگ', isVariantAxis: true, isRequired: false },
  ],
  variants: [],
};

const allAttributes = [
  { id: 'attr-1', code: 'color', name: 'رنگ', description: null, status: 'ACTIVE' as const, optionCount: 1, version: 1, createdAt: '', updatedAt: '' },
  { id: 'attr-2', code: 'size', name: 'سایز', description: null, status: 'ACTIVE' as const, optionCount: 1, version: 1, createdAt: '', updatedAt: '' },
  { id: 'attr-3', code: 'jeans', name: 'جنس', description: null, status: 'INACTIVE' as const, optionCount: 1, version: 1, createdAt: '', updatedAt: '' },
];

function renderEditor(props: Partial<Parameters<typeof AttributeConfigEditor>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <AttributeConfigEditor
        product={product}
        allAttributes={allAttributes}
        canWrite
        onChanged={vi.fn()}
        {...props}
      />
    </FeedbackProvider>,
  );
}

describe('AttributeConfigEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configureProductAttributes.mockResolvedValue({
      product: { ...product, name: 'قفل دستگیره‌ای' },
    });
  });

  it('renders the configured attributes and hides disabled candidates', () => {
    renderEditor();
    expect(screen.getByText('رنگ')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'افزودن ویژگی' }));
    expect(screen.getByText('سایز')).toBeInTheDocument();
    expect(screen.queryByText('جنس')).not.toBeInTheDocument();
  });

  it('adds a candidate and saves the draft with product version', async () => {
    const onChanged = vi.fn();
    renderEditor({ onChanged });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'افزودن ویژگی' }));
    fireEvent.click(screen.getByText('سایز'));
    fireEvent.click(screen.getByRole('button', { name: 'افزودن' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ ویژگی‌ها' }));

    await waitFor(() =>
      expect(mocks.configureProductAttributes).toHaveBeenCalledWith(
        'p1',
        3,
        expect.arrayContaining([
          { attributeCode: 'color', isVariantAxis: true, isRequired: false },
          { attributeCode: 'size', isVariantAxis: false, isRequired: false },
        ]),
      ),
    );
    expect(await screen.findByText(/ویژگی‌های «قفل دستگیره‌ای» به‌روزرسانی شد/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('drops the required flag when an axis is unchecked and hides the save button without changes', () => {
    renderEditor();
    fireEvent.click(screen.getByLabelText('color محور واریانت'));
    expect(screen.getByRole('button', { name: 'ذخیرهٔ ویژگی‌ها' })).toBeEnabled();
  });

  it('refreshes on a version conflict and surfaces other API errors', async () => {
    const onChanged = vi.fn();
    mocks.configureProductAttributes.mockRejectedValueOnce(
      new ApiClientError({ code: 'STALE_VERSION', message: 'conflict', requestId: 'r', statusCode: 409 }),
    );
    renderEditor({ onChanged });
    fireEvent.click(screen.getByLabelText('color محور واریانت'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ ویژگی‌ها' }));
    expect(
      await screen.findByText('اطلاعات کالا در همان لحظه توسط شخص دیگری تغییر کرد؛ صفحه برای بارگذاری نسخهٔ تازه به‌روزرسانی می‌شود.'),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);

    mocks.configureProductAttributes.mockRejectedValueOnce(new Error('down'));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ ویژگی‌ها' }));
    expect(
      await screen.findByText('ذخیرهٔ ویژگی‌ها ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });

  it('shows an empty message and disables add when no active candidates exist', () => {
    renderEditor({ product: { ...product, attributes: [] }, allAttributes: [] });
    expect(
      screen.getByText(/ویژگی‌ای به این کالا متصل نیست/),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('افزودن ویژگی').closest('.MuiOutlinedInput-root, .MuiSelect-root'),
    ).toHaveClass('Mui-disabled');
  });

  it('hides mutation controls for read-only access', () => {
    renderEditor({ canWrite: false });
    expect(screen.queryByRole('button', { name: 'ذخیرهٔ ویژگی‌ها' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('حذف ویژگی color')).not.toBeInTheDocument();
  });
});