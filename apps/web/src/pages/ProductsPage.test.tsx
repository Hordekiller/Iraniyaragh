import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import { LISTING_PER_PAGE } from '../services/catalog/types'
import type { CatalogApi, CatalogListResult, CatalogProduct } from '../services/catalog/types'
import { toPersianDigits } from '../lib/format'
import { ProductsPage } from './ProductsPage'

function product(index: number): CatalogProduct {
  return {
    id: `p-${index}`,
    slug: `product-${index}`,
    name: `کالای شماره ${toPersianDigits(index)}`,
    brand: 'Ronix',
    category: { id: 'c-power', name: 'ابزار برقی', slug: 'power-tools', parentId: null },
    image: '/images/hero1.jpg',
    media: [],
    description: null,
    price: { amount: '1000000', currency: 'IRR' },
    oldPrice: null,
    rating: 4.5,
    reviews: 10,
    stockStatus: 'IN_STOCK',
    badge: null,
    variants: [],
    defaultVariantId: null,
  }
}

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => []),
    listBrands: vi.fn(async () => []),
    listProducts: vi.fn(async (): Promise<CatalogListResult> => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
    getProductBySlug: vi.fn(async () => { throw new Error('not found') }),
    ...overrides,
  }
}

function renderProducts(api: CatalogApi, path = '/products') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/products"
          element={
            <CatalogProvider api={api}>
              <ProductsPage />
            </CatalogProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProductsPage', () => {
  it('requests the catalog with paging and shows the API total', async () => {
    const listProducts = vi.fn(async () => ({
      items: [product(1), product(2)],
      meta: { page: 1, perPage: 24, total: 2, pages: 1 },
    }))
    renderProducts(stubCatalog({ listProducts }))

    expect(await screen.findByRole('link', { name: /کالای شماره ۱/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ sortBy: 'newest', page: 1, perPage: 24 }),
    )
    expect(screen.getByText('۲ کالا')).toBeInTheDocument()
  })

  it('opens a page directly from the URL and shows that page of results', async () => {
    const listProducts = vi.fn(async () => ({
      items: [product(49)],
      meta: { page: 3, perPage: 24, total: 60, pages: 3 },
    }))
    renderProducts(stubCatalog({ listProducts }), '/products?page=3')

    expect(await screen.findByRole('link', { name: /کالای شماره ۴۹/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith(expect.objectContaining({ page: 3 }))
    expect(screen.getByRole('button', { name: 'صفحه ۳' })).toHaveAttribute('aria-current', 'page')
  })

  it('applies the brand filter from the URL and resets to the first page', async () => {
    const listProducts = vi.fn(async () => ({ items: [product(1)], meta: { page: 1, perPage: 24, total: 1, pages: 1 } }))
    renderProducts(
      stubCatalog({ listProducts, listBrands: vi.fn(async () => [{ id: 'b1', name: 'Ronix', slug: 'ronix' }]) }),
      '/products?brand=ronix',
    )

    expect(await screen.findByRole('link', { name: /کالای شماره ۱/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith(expect.objectContaining({ brand: 'ronix', page: 1 }))
    expect((screen.getByLabelText('برند') as HTMLSelectElement).value).toBe('ronix')
  })

  it('shows an honest empty state and no pagination when the catalog is empty', async () => {
    renderProducts(stubCatalog())

    expect(await screen.findByText('هنوز کالایی در فروشگاه ثبت نشده است.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'صفحه‌بندی نتایج' })).not.toBeInTheDocument()
  })

  it('shows a Persian error alert and keeps the heading when the catalog call fails', async () => {
    renderProducts(stubCatalog({ listProducts: vi.fn(async () => { throw new Error('down') }) }))

    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری محصولات با خطا مواجه شد.')
    expect(screen.getByRole('heading', { name: 'همه کالاها' })).toBeInTheDocument()
  })

  it('keeps the listing usable when the brand lookup fails', async () => {
    renderProducts(stubCatalog({
      listBrands: vi.fn(async () => { throw new Error('down') }),
      listProducts: vi.fn(async () => ({ items: [product(1)], meta: { page: 1, perPage: 24, total: 1, pages: 1 } })),
    }))

    expect(await screen.findByRole('link', { name: /کالای شماره ۱/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('re-requests when the sort order changes and resets paging', async () => {
    const listProducts = vi.fn(async () => ({ items: [product(1)], meta: { page: 1, perPage: 24, total: 60, pages: 3 } }))
    renderProducts(stubCatalog({ listProducts }), '/products?page=3')

    await screen.findByRole('link', { name: /کالای شماره ۱/ })
    fireEvent.change(screen.getByLabelText('مرتب‌سازی'), { target: { value: 'name' } })

    await waitFor(() => {
      const last = (listProducts.mock.calls as unknown as Array<[Record<string, unknown>]>).at(-1)?.[0]
      expect(last).toMatchObject({ sortBy: 'name', page: 1 })
    })
  })

  it('drives the whole paging flow from the API meta, not from the page length', async () => {
    // 57 products over 24 per page = 3 pages. Only 24 items ever arrive at a time,
    // so the count, the range and the page window can only come from `meta`.
    const TOTAL = 57
    const PAGES = 3
    const listProducts = vi.fn(async (query = {}) => {
      const page_ = (query as { page?: number }).page ?? 1
      const start = (page_ - 1) * LISTING_PER_PAGE
      return {
        items: Array.from({ length: Math.min(LISTING_PER_PAGE, TOTAL - start) }, (_, i) => product(start + i + 1)),
        meta: { page: page_, perPage: LISTING_PER_PAGE, total: TOTAL, pages: PAGES },
      }
    })
    renderProducts(stubCatalog({ listProducts }))

    expect(await screen.findByText('۵۷ کالا')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'صفحه‌بندی نتایج' })
    expect(within(nav).getByText('نمایش ۱ تا ۲۴ از ۵۷ کالا')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'صفحه ۱' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('button', { name: 'صفحه قبل' })).toBeDisabled()

    // Jump to the last page: the range and the disabled control both follow `meta`.
    fireEvent.click(within(nav).getByRole('button', { name: 'صفحه ۳' }))
    expect(await within(nav).findByText('نمایش ۴۹ تا ۵۷ از ۵۷ کالا')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'صفحه بعد' })).toBeDisabled()
    expect(within(nav).getByRole('button', { name: 'صفحه ۳' })).toHaveAttribute('aria-current', 'page')

    const pages = (listProducts.mock.calls as unknown as Array<[Record<string, unknown>]>).map(call => call[0].page)
    expect(pages).toEqual([1, 3])

    // A filter change resets the offset rather than stranding the user on page 3.
    fireEvent.change(screen.getByLabelText('مرتب‌سازی'), { target: { value: 'name' } })
    await waitFor(() => {
      const last = (listProducts.mock.calls as unknown as Array<[Record<string, unknown>]>).at(-1)?.[0]
      expect(last).toMatchObject({ sortBy: 'name', page: 1 })
    })
  })
})

