import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { CATALOG_READ, CATALOG_WRITE } from '@/lib/catalog/catalog-permissions';
import { ProductsView, type CatalogUrlQuery } from '../ProductsView';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  user: null as { permissions: string[] } | null,
  listProducts: vi.fn(),
  listBrands: vi.fn(),
  listCategories: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, isAuthenticated: true, signIn: vi.fn(), signOut: vi.fn() }),
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  listProducts: mocks.listProducts,
  listBrands: mocks.listBrands,
  listCategories: mocks.listCategories,
}));

const itemPublished = {
  id: 'p1',
  name: 'قفل دستگیره‌ای',
  slug: 'lock-handle',
  status: 'PUBLISHED' as const,
  brandId: 'b1',
  categoryId: 'c1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
};

function renderView(initialQuery: CatalogUrlQuery = {}) {
  return render(
    <FeedbackProvider>
      <ProductsView initialQuery={initialQuery} />
    </FeedbackProvider>,
  );
}

describe('ProductsView', () => {
  beforeEach(() => {
    mocks.user = { permissions: [CATALOG_READ, CATALOG_WRITE] };
    mocks.listProducts.mockResolvedValue({
      items: [itemPublished],
      meta: { page: 1, perPage: 25, total: 1, pages: 1 },
    });
    mocks.listBrands.mockResolvedValue([{ id: 'b1', name: 'آبان لک', slug: 'abanlock', productCount: 1 }]);
    mocks.listCategories.mockResolvedValue([{ id: 'c1', name: 'قفل‌ها', slug: 'locks', parentId: null, productCount: 1 }]);
    mocks.replace.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders products with localized status chips and reference names', async () => {
    renderView();

    expect(await screen.findByText('قفل دستگیره‌ای')).toBeInTheDocument();
    expect(screen.getByText(/منتشرشده/)).toBeInTheDocument();
    expect(screen.getByText('آبان لک')).toBeInTheDocument();
    expect(screen.getByText('قفل‌ها')).toBeInTheDocument();
    expect(screen.queryByText('کالایی یافت نشد')).not.toBeInTheDocument();
  });

  it('shows a forbidden state without catalog.read', async () => {
    mocks.user = { permissions: [] };
    renderView();

    expect(await screen.findByText('دسترسی ندارید')).toBeInTheDocument();
    expect(screen.queryByText('قفل دستگیره‌ای')).not.toBeInTheDocument();
  });

  it('hides status actions and creation when the user cannot write', async () => {
    mocks.user = { permissions: [CATALOG_READ] };
    renderView();

    await screen.findByText('قفل دستگیره‌ای');
    expect(screen.queryByRole('button', { name: 'کالای جدید' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /اقدامات/ })).not.toBeInTheDocument();
    expect(screen.getByText(/فقط دسترسی خواندن/)).toBeInTheDocument();
  });

  it('offers creation and per-row status actions for writers', async () => {
    renderView();

    await screen.findByText('قفل دستگیره‌ای');
    expect(screen.getByRole('link', { name: /کالای جدید/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /اقدامات/ })).toBeInTheDocument();
  });

  it('debounces the search box into a URL update', async () => {
    renderView();

    const searchBox = await screen.findByRole('textbox', { name: 'جستجو' });
    fireEvent.change(searchBox, { target: { value: 'قفل' } });

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/catalog?search=%D9%82%D9%81%D9%84', { scroll: false }), {
      timeout: 2000,
    });
  });

  it('updates the URL when a status filter is selected', async () => {
    renderView();
    await screen.findByText('قفل دستگیره‌ای');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'فیلتر وضعیت' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByText('پیش‌نویس'));

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/catalog?status=DRAFT', { scroll: false }));
  });

  it('reflects the initial query values from the URL', async () => {
    renderView({ status: 'PUBLISHED', page: '2', search: 'قفل' });

    await screen.findByText('قفل دستگیره‌ای');
    expect(mocks.listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PUBLISHED', page: 2, search: 'قفل' }),
      expect.any(AbortSignal),
    );
  });

  it('shows the empty state and total chip when there are no products', async () => {
    mocks.listProducts.mockResolvedValue({
      items: [],
      meta: { page: 1, perPage: 25, total: 0, pages: 0 },
    });
    renderView();

    expect(await screen.findByText('کالایی یافت نشد')).toBeInTheDocument();
    expect(screen.getByText(/۰ کالا/)).toBeInTheDocument();
  });

  it('renders brand and category filter options', async () => {
    renderView();
    await screen.findByText('قفل دستگیره‌ای');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'فیلتر برند' }));
    expect(within(screen.getByRole('listbox')).getByText('آبان لک')).toBeInTheDocument();
  });
});