import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CATALOG_READ, CATALOG_WRITE } from '@/lib/catalog/catalog-permissions';
import type { AttributeDefinitionSummary, ProductDetail } from '@iranyaragh/contracts';
import { ProductDetailView } from '../ProductDetailView';

const mocks = vi.hoisted(() => ({
  user: { permissions: [] as string[] },
  getProduct: vi.fn(),
  listAttributes: vi.fn(),
  configureProductAttributes: vi.fn(),
  changeProductStatus: vi.fn(),
  changeVariantStatus: vi.fn(),
  updateVariant: vi.fn(),
  updateVariantPrice: vi.fn(),
  getVariantPriceHistory: vi.fn(),
  getAttribute: vi.fn(),
  previewVariantGeneration: vi.fn(),
  generateVariants: vi.fn(),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  getProduct: mocks.getProduct,
  listAttributes: mocks.listAttributes,
  configureProductAttributes: mocks.configureProductAttributes,
  changeProductStatus: mocks.changeProductStatus,
  changeVariantStatus: mocks.changeVariantStatus,
  updateVariant: mocks.updateVariant,
  updateVariantPrice: mocks.updateVariantPrice,
  getVariantPriceHistory: mocks.getVariantPriceHistory,
  getAttribute: mocks.getAttribute,
  previewVariantGeneration: mocks.previewVariantGeneration,
  generateVariants: mocks.generateVariants,
  updateProductDescription: vi.fn(),
  createIdempotencyKey: (prefix: string) => `${prefix}-key`,
}));

vi.mock('@/components/editor/RichTextEditor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <textarea data-testid="rte" readOnly value={value} />,
}));

const colorAttribute: AttributeDefinitionSummary = {
  id: 'attr-color',
  code: 'color',
  name: 'رنگ',
  description: null,
  status: 'ACTIVE',
  optionCount: 2,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const product: ProductDetail = {
  id: 'p1',
  name: 'قفل دستگیره‌ای',
  slug: 'lock-handle',
  status: 'PUBLISHED',
  version: 3,
  brandId: 'b1',
  categoryId: 'c1',
  brand: { id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 1 },
  category: { id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 1 },
  description: 'توضیح نمونه',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  attributes: [{ attributeCode: 'color', attributeName: 'رنگ', isVariantAxis: true, isRequired: true }],
  variants: [
    {
      id: 'v1',
      sku: 'LOCK-RED-M',
      title: 'قرمز',
      status: 'ACTIVE',
      isActive: true,
      version: 1,
      costPrice: { amount: '1500', currency: 'IRR' },
      salePrice: { amount: '2500', currency: 'IRR' },
      attributeValues: [
        { attributeCode: 'color', attributeName: 'رنگ', optionCode: 'red', optionLabel: 'قرمز', isVariantAxis: true },
      ],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ],
};

function renderView() {
  return render(
    <FeedbackProvider>
      <ProductDetailView productId="p1" />
    </FeedbackProvider>,
  );
}

describe('ProductDetailView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { permissions: [CATALOG_READ, CATALOG_WRITE] };
    mocks.getProduct.mockResolvedValue({ product });
    mocks.listAttributes.mockResolvedValue({ items: [colorAttribute] });
    mocks.configureProductAttributes.mockResolvedValue({ product });
    mocks.getVariantPriceHistory.mockResolvedValue({ items: [] });
    mocks.getAttribute.mockResolvedValue({
      attribute: { ...colorAttribute, options: [] },
    });
  });

  it('blocks access without catalog.read', async () => {
    mocks.user = { permissions: [] };
    renderView();
    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(screen.getByText('حساب شما برای مشاهدهٔ کاتالوگ مجوز ندارد.')).toBeInTheDocument();
  });

  it('renders the product details, specifications and variant rows', async () => {
    renderView();
    expect((await screen.findAllByText('قفل دستگیره‌ای')).length).toBeGreaterThan(0);
    expect(screen.getByText('آبان لک')).toBeInTheDocument();
    expect(screen.getByText('قفل‌ها')).toBeInTheDocument();
    expect(screen.getByText('lock-handle')).toBeInTheDocument();
    expect(screen.getByTestId('rte')).toHaveValue('توضیح نمونه');
    expect(screen.getByText('LOCK-RED-M')).toBeInTheDocument();
    expect(screen.getByText('رنگ: قرمز')).toBeInTheDocument();
  });

  it('keeps read-only access from exposing mutation controls', async () => {
    mocks.user = { permissions: [CATALOG_READ] };
    renderView();
    expect(
      await screen.findByText('حساب شما فقط دسترسی خواندن دارد؛ ویرایش تنوع‌ها و ویژگی‌ها غیرفعال است.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تولید تنوع از محورها' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('اقدامات LOCK-RED-M')).not.toBeInTheDocument();
  });

  it('opens the variant generation dialog for writers', async () => {
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'تولید تنوع از محورها' }));
    expect(
      await screen.findByRole('dialog', { name: 'تولید تنوع از محورها' }),
    ).toBeInTheDocument();
    expect(mocks.getAttribute).toHaveBeenCalledWith('attr-color', expect.any(AbortSignal));
  });

  it('surfaces load failures without rendering the body', async () => {
    mocks.getProduct.mockRejectedValue(new Error('601'));
    renderView();
    expect(await screen.findByText('601')).toBeInTheDocument();
    expect(screen.queryByText('مشخصات')).not.toBeInTheDocument();
  });
});