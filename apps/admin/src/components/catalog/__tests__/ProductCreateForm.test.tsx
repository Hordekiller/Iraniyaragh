import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ProductCreateForm } from '../ProductCreateForm';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listBrands: vi.fn(),
  listCategories: vi.fn(),
  createProduct: vi.fn(),
  createBrand: vi.fn(),
  createCategory: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { userId: 'staff-1', sessionId: 'session-1', authenticationLevel: 'STAFF_MFA', permissions: ['catalog.write', 'catalog.media.read', 'catalog.media.write'] } }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  listBrands: mocks.listBrands,
  listCategories: mocks.listCategories,
  createProduct: mocks.createProduct,
  createBrand: mocks.createBrand,
  createCategory: mocks.createCategory,
  createIdempotencyKey: (prefix: string) => `${prefix}-test-key`,
}));

vi.mock('../ProductMediaManager', () => ({ ProductMediaManager: ({ productId, initialFiles }: { productId: string; initialFiles: File[] }) =>
  <div data-testid="creation-upload-queue">{productId}:{initialFiles.map(file => file.name).join(',')}</div> }));

function renderForm() {
  return render(
    <FeedbackProvider>
      <ProductCreateForm />
    </FeedbackProvider>,
  );
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'قفل دستگیره‌ای' } });
  fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'lock-handle' } });
  fireEvent.change(document.getElementById('variant-0-sku')!, { target: { value: 'LOCK-001' } });
  fireEvent.change(document.getElementById('variant-0-cost')!, { target: { value: '180000' } });
  fireEvent.change(document.getElementById('variant-0-sale')!, { target: { value: '240000' } });
  await screen.findByText('مشخصات پایه');
}

describe('ProductCreateForm', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('loads brand and category references', async () => {
    mocks.listBrands.mockResolvedValue([{ id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 0 }]);
    mocks.listCategories.mockResolvedValue([{ id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 0 }]);
    renderForm();

    await screen.findByText('مشخصات پایه');
    expect(screen.getByLabelText('وضعیت آغازین')).toHaveAttribute('readonly');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'برند' }));
    expect(withinListbox().getByText('آبان لک')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'دسته‌بندی' }));
    expect(withinListbox().getByText('قفل‌ها')).toBeInTheDocument();
  });

  it('shows a warning when references fail to load', async () => {
    mocks.listBrands.mockRejectedValue(new Error('خطا'));
    mocks.listCategories.mockResolvedValue([]);
    renderForm();

    expect(await screen.findByText(/بارگیری برندها و دسته‌بندی‌ها ناموفق بود/)).toBeInTheDocument();
  });

  it('blocks submission with validation errors', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    renderForm();
    await screen.findByText('مشخصات پایه');

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    expect(screen.getByText('نام کالا الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('شناسه (Slug) الزامی است.')).toBeInTheDocument();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug pattern', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    renderForm();
    await screen.findByText('مشخصات پایه');

    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'Lock_Handle!' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    expect(
      await screen.findByText('شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.'),
    ).toBeInTheDocument();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('submits a valid product with normalized slug and money', async () => {
    mocks.listBrands.mockResolvedValue([{ id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 0 }]);
    mocks.listCategories.mockResolvedValue([{ id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 0 }]);
    mocks.createProduct.mockResolvedValue({
      product: { id: 'p9', name: 'قفل دستگیره‌ای', slug: 'lock-handle', status: 'DRAFT', brandId: null, categoryId: null, createdAt: '', updatedAt: '' },
    });

    renderForm();
    await screen.findByText('مشخصات پایه');
    fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'قفل دستگیره‌ای' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'LOCK Handle' } });
    fireEvent.change(document.getElementById('variant-0-sku')!, { target: { value: 'LOCK-001' } });
    fireEvent.change(document.getElementById('variant-0-cost')!, { target: { value: '180000' } });
    fireEvent.change(document.getElementById('variant-0-sale')!, { target: { value: '240000' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'برند' }));
    fireEvent.click(withinListbox().getByText('آبان لک'));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'دسته‌بندی' }));
    fireEvent.click(withinListbox().getByText('قفل‌ها'));

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    await waitFor(() =>
      expect(mocks.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'قفل دستگیره‌ای',
          slug: 'lock-handle',
          brandId: 'b1',
          categoryId: 'c1',
          status: 'DRAFT',
          variants: [{
            sku: 'LOCK-001',
            costPrice: { amount: '180000', currency: 'IRR' },
            salePrice: { amount: '240000', currency: 'IRR' },
            isActive: true,
          }],
        }),
        expect.any(String),
      ),
    );

    expect(await screen.findByText(/کالای «قفل دستگیره‌ای» با موفقیت ثبت شد/)).toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/catalog/products/p9');
  }, 15_000);

  it('surfaces the API error reply', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    mocks.createProduct.mockRejectedValue(
      new ApiClientError({ code: 'CATALOG_SLUG_CONFLICT', message: 'این شناسه از قبل ثبت شده', requestId: 'r', statusCode: 409 }),
    );
    renderForm();
    await screen.findByText('مشخصات پایه');
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    expect(await screen.findByText('این شناسه از قبل ثبت شده')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  }, 15_000);

  it('requires at least one complete SKU variant before product creation', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    renderForm();
    await screen.findByText('مشخصات پایه');
    fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'قفل دستگیره‌ای' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'lock-handle' } });
    fireEvent.change(document.getElementById('variant-0-sku')!, { target: { value: 'LOCK-001' } });
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));
    expect(await screen.findByText('قیمت خرید الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('قیمت فروش الزامی است.')).toBeInTheDocument();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('selects a newly created brand even if the following reference refresh fails', async () => {
    mocks.listBrands.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('offline'));
    mocks.listCategories.mockResolvedValue([]);
    mocks.createBrand.mockResolvedValue({ brand: { id: 'new-brand', name: 'برند تازه', slug: 'new-brand' } });
    mocks.createProduct.mockResolvedValue({ product: { id: 'p9', name: 'قفل' } });
    renderForm();
    await fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: 'افزودن برند' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/نام برند/), { target: { value: 'برند تازه' } });
    fireEvent.change(dialog.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'new-brand' } });
    fireEvent.click(dialog.getByRole('button', { name: 'ساخت برند' }));
    expect(await screen.findByText('بارگیری برندها ناموفق بود؛ دوباره تلاش کنید.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'برند' })).toHaveTextContent('برند تازه');
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));
    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledWith(expect.objectContaining({ brandId: 'new-brand' }), expect.any(String)));
  });

  it('keeps selected images attached to the saved draft instead of navigating away or creating twice', async () => {
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL() { return 'blob:preview'; }
      static revokeObjectURL() { /* preview released */ }
    });
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    mocks.createProduct.mockResolvedValue({ product: { id: 'saved-draft', name: 'قفل' } });
    renderForm();
    await fillRequiredFields();
    const input = screen.getByLabelText('تصاویر کالا', { exact: true });
    fireEvent.change(input, { target: { files: [new File(['image'], 'queued.png', { type: 'image/png' })] } });
    expect(await screen.findByAltText('پیش‌نمایش queued.png')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));
    expect(await screen.findByTestId('creation-upload-queue')).toHaveTextContent('saved-draft:queued.png');
    expect(mocks.createProduct).toHaveBeenCalledTimes(1);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'جزئیات و انتشار کالا' })).toHaveAttribute('href', '/catalog/products/saved-draft');
    expect(screen.queryByRole('button', { name: 'ثبت کالا' })).not.toBeInTheDocument();
  });
});

function withinListbox() {
  return within(screen.getByRole('listbox'));
}
