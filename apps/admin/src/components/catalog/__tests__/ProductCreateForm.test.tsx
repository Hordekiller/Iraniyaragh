import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { ProductCreateForm } from '../ProductCreateForm';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  listBrands: vi.fn(),
  listCategories: vi.fn(),
  createProduct: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  listBrands: mocks.listBrands,
  listCategories: mocks.listCategories,
  createProduct: mocks.createProduct,
  createIdempotencyKey: (prefix: string) => `${prefix}-test-key`,
}));

function renderForm() {
  return render(
    <FeedbackProvider>
      <ProductCreateForm />
    </FeedbackProvider>,
  );
}

async function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'قفل دستگیره‌ای' } });
  fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'LOCK Handle' } });
  fireEvent.change(screen.getByLabelText(/کد SKU/), { target: { value: 'SKU-1' } });
  fireEvent.change(screen.getByLabelText(/قیمت خرید/), { target: { value: '100000' } });
  fireEvent.change(screen.getByLabelText(/قیمت فروش/), { target: { value: '150000' } });
  await screen.findByText('مشخصات کالا');
}

describe('ProductCreateForm', () => {
  it('loads brand and category references', async () => {
    mocks.listBrands.mockResolvedValue([{ id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 0 }]);
    mocks.listCategories.mockResolvedValue([{ id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 0 }]);
    renderForm();

    await screen.findByText('مشخصات کالا');
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
    await screen.findByText('مشخصات کالا');

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    expect(screen.getByText('نام کالا الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('شناسه (Slug) الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('کد SKU الزامی است.')).toBeInTheDocument();
    expect(screen.getByText('قیمت فروش الزامی است.')).toBeInTheDocument();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it('rejects an invalid slug pattern', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    renderForm();
    await screen.findByText('مشخصات کالا');

    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'Lock_Handle!' } });
    fireEvent.change(screen.getByLabelText(/کد SKU/), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText(/قیمت خرید/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/قیمت فروش/), { target: { value: '2' } });
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
    await screen.findByText('مشخصات کالا');
    fireEvent.change(screen.getByLabelText(/نام کالا/), { target: { value: 'قفل دستگیره‌ای' } });
    fireEvent.change(screen.getByLabelText(/شناسهٔ یکتا/), { target: { value: 'LOCK Handle' } });
    fireEvent.change(screen.getByLabelText(/کد SKU/), { target: { value: 'SKU-1' } });
    fireEvent.change(screen.getByLabelText(/قیمت خرید/), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText(/قیمت فروش/), { target: { value: '150000' } });

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    await waitFor(() =>
      expect(mocks.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'قفل دستگیره‌ای',
          slug: 'lock-handle',
          status: 'DRAFT',
          variants: [
            expect.objectContaining({
              sku: 'SKU-1',
              costPrice: { amount: '100000', currency: 'IRR' },
              salePrice: { amount: '150000', currency: 'IRR' },
              isActive: true,
            }),
          ],
        }),
        expect.any(String),
      ),
    );

    expect(await screen.findByText(/کالای «قفل دستگیره‌ای» با موفقیت ثبت شد/)).toBeInTheDocument();
    expect(mocks.replace).toHaveBeenCalledWith('/catalog');
  });

  it('surfaces the API error reply', async () => {
    mocks.listBrands.mockResolvedValue([]);
    mocks.listCategories.mockResolvedValue([]);
    mocks.createProduct.mockRejectedValue(
      new ApiClientError({ code: 'CATALOG_SLUG_CONFLICT', message: 'این شناسه از قبل ثبت شده', requestId: 'r', statusCode: 409 }),
    );
    renderForm();
    await screen.findByText('مشخصات کالا');
    await fillRequiredFields();

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کالا' }));

    expect(await screen.findByText('این شناسه از قبل ثبت شده')).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

function withinListbox() {
  return within(screen.getByRole('listbox'));
}
