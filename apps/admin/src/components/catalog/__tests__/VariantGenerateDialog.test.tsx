import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { AttributeDefinitionSummary, ProductDetail } from '@iranyaragh/contracts';
import { VariantGenerateDialog } from '../VariantGenerateDialog';

const mocks = vi.hoisted(() => ({
  getAttribute: vi.fn(),
  previewVariantGeneration: vi.fn(),
  generateVariants: vi.fn(),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  getAttribute: mocks.getAttribute,
  previewVariantGeneration: mocks.previewVariantGeneration,
  generateVariants: mocks.generateVariants,
  createIdempotencyKey: (() => {
    let next = 0;
    return (prefix: string) => `${prefix}-key-${(next += 1)}`;
  })(),
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
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  attributes: [
    { attributeCode: 'color', attributeName: 'رنگ', isVariantAxis: true, isRequired: false },
    { attributeCode: 'size', attributeName: 'سایز', isVariantAxis: true, isRequired: false },
  ],
  variants: [
    {
      id: 'v1',
      sku: 'LOCK-RED-M',
      status: 'ACTIVE',
      isActive: true,
      version: 1,
      costPrice: { amount: '1500', currency: 'IRR' },
      salePrice: { amount: '3000', currency: 'IRR' },
      attributeValues: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

const attributesById: Record<string, AttributeDefinitionSummary> = {
  color: { id: 'attr-color', code: 'color', name: 'رنگ', description: null, status: 'ACTIVE', optionCount: 2, version: 1, createdAt: '', updatedAt: '' },
  size: { id: 'attr-size', code: 'size', name: 'سایز', description: null, status: 'ACTIVE', optionCount: 2, version: 1, createdAt: '', updatedAt: '' },
};

function mockAxisOptions() {
  mocks.getAttribute.mockImplementation((id: string) =>
    Promise.resolve({
      attribute: {
        id,
        code: id === 'attr-color' ? 'color' : 'size',
        name: id === 'attr-color' ? 'رنگ' : 'سایز',
        status: 'ACTIVE',
        version: 1,
        options:
          id === 'attr-color'
            ? [
                { id: 'o1', code: 'red', label: 'قرمز', status: 'ACTIVE' },
                { id: 'o2', code: 'blue', label: 'آبی', status: 'INACTIVE' },
              ]
            : [
                { id: 'o3', code: 'M', label: 'M', status: 'ACTIVE' },
                { id: 'o4', code: 'L', label: 'L', status: 'ACTIVE' },
              ],
      },
    }),
  );
}

function renderDialog(props: Partial<Parameters<typeof VariantGenerateDialog>[0]> = {}) {
  return render(
    <FeedbackProvider>
      <VariantGenerateDialog
        product={product}
        attributesById={attributesById}
        onGenerated={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </FeedbackProvider>,
  );
}

describe('VariantGenerateDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxisOptions();
    mocks.previewVariantGeneration.mockResolvedValue({ total: 1, limit: 2000 });
    mocks.generateVariants.mockResolvedValue({});
  });

  it('explains that no variant axes are configured yet', async () => {
    renderDialog({ product: { ...product, attributes: [] } });
    expect(
      await screen.findByText(/این کالا هنوز محور واریانت ندارد/),
    ).toBeInTheDocument();
  });

  it('shows a load failure for the axis options', async () => {
    mocks.getAttribute.mockRejectedValue(new Error('down'));
    renderDialog();
    expect(
      await screen.findByText('بارگیری گزینه‌های محورها ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
  });

  it('only lists active options and previews the combination count before generating', async () => {
    const onGenerated = vi.fn();
    const onClose = vi.fn();
    renderDialog({ onGenerated, onClose });

    fireEvent.click(await screen.findByLabelText('رنگ: red'));
    fireEvent.click(screen.getByLabelText('سایز: M'));
    expect(screen.queryByLabelText('رنگ: blue')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش ترکیب‌ها' }));
    await waitFor(() =>
      expect(mocks.previewVariantGeneration).toHaveBeenCalledWith('p1', {
        optionSelection: { color: ['red'], size: ['M'] },
      }),
    );
    expect(await screen.findByText(/۱ ترکیب آمادهٔ ایجاد است/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ایجاد ۱ تنوع' }));
    await waitFor(() =>
      expect(mocks.generateVariants).toHaveBeenCalledWith(
        'p1',
        {
          optionSelection: { color: ['red'], size: ['M'] },
          costPrice: { amount: '1500', currency: 'IRR' },
          salePrice: { amount: '3000', currency: 'IRR' },
        },
        'catalog-variant-generate-key-1',
      ),
    );
    expect(await screen.findByText(/تنوع‌های «قفل دستگیره‌ای» تولید شدند/)).toBeInTheDocument();
    expect(onGenerated).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks generation when the amount fields are invalid', async () => {
    const noPrices = {
      ...product,
      variants: [
        {
          ...product.variants[0]!,
          costPrice: { amount: '', currency: 'IRR' as const },
          salePrice: { amount: '', currency: 'IRR' as const },
        },
      ],
    };
    renderDialog({ product: noPrices });
    fireEvent.click(await screen.findByLabelText('رنگ: red'));
    fireEvent.click(screen.getByLabelText('سایز: M'));
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش ترکیب‌ها' }));
    fireEvent.click(await screen.findByRole('button', { name: 'ایجاد ۱ تنوع' }));

    expect(screen.getAllByText('فقط ارقام (بدون جداکننده) مجاز است.')).toHaveLength(2);
    expect(mocks.generateVariants).not.toHaveBeenCalled();
  });

  it('shows the configured limit warning when the total hits the ceiling', async () => {
    mocks.previewVariantGeneration.mockResolvedValue({ total: 2000, limit: 2000 });
    renderDialog();
    fireEvent.click(await screen.findByLabelText('رنگ: red'));
    fireEvent.click(screen.getByLabelText('سایز: M'));
    fireEvent.click(screen.getByRole('button', { name: 'پیش‌نمایش ترکیب‌ها' }));
    expect(
      await screen.findByText(/(سقف ۲٬۰۰۰ ترکیب)/),
    ).toBeInTheDocument();
  });
});