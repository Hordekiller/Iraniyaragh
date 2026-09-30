import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogCategory, CatalogListResult, CatalogProduct } from '../services/catalog/types'
import { CategoryPage } from './CategoryPage'

const CATEGORY: CatalogCategory = {
  id: 'cat-power',
  name: 'ابزار برقی',
  slug: 'power-tools',
  parentId: null,
  productCount: 320,
  image: '/images/hero1.jpg',
}

function product(slug: string, name: string): CatalogProduct {
  return {
    id: `p-${slug}`,
    slug,
    name,
    brand: 'Ronix',
    category: { id: 'cat-power', name: 'ابزار برقی', slug: 'power-tools', parentId: null },
    image: '/images/hero1.jpg',
    media: [],
    description: null,
    price: { amount: '28500000', currency: 'IRR' },
    oldPrice: null,
    rating: 4.8,
    reviews: 342,
    stockStatus: 'IN_STOCK' as const,
    badge: null,
    variants: [],
    defaultVariantId: null,
  }
}

function result(overrides: Partial<CatalogListResult> = {}): CatalogListResult {
  return {
    items: [product('ronix-2210-hammer-drill', 'دریل چکشی رونیکس')],
    meta: { page: 1, perPage: 24, total: 1, pages: 1 },
    ...overrides,
  }
}

function emptyResult(): CatalogListResult {
  return { items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } }
}

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => [CATEGORY]),
    listBrands: vi.fn(async () => []),
    listProducts: vi.fn(async () => result()),
    getProductBySlug: vi.fn(async () => { throw new Error('not found') }),
    ...overrides,
  }
}

function renderCategory(slug: string, api: CatalogApi, initialPath = `/category/${slug}`) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/category/:slug"
          element={
            <CatalogProvider api={api}>
              <CategoryPage />
            </CatalogProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('CategoryPage', () => {
  it('shows the loading state and then the category name and its products', async () => {
    renderCategory('power-tools', stubCatalog())

    expect(screen.getByText('در حال بارگذاری محصولات...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })).toBeInTheDocument()
    // The count comes from the API's meta.total, not the length of the page.
    expect(screen.getByText('۱ کالا')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'دسته‌بندی کالاها' })).toHaveAttribute('href', '/categories')
  })

  it('reports a slug that is not in the live catalog instead of an empty grid', async () => {
    renderCategory('nope', stubCatalog({ listProducts: vi.fn(async () => emptyResult()) }))

    expect(await screen.findByRole('heading', { name: 'دسته‌بندی یافت نشد' })).toBeInTheDocument()
    expect(screen.getByText('دسته‌بندی با این نشانی در فروشگاه ثبت نشده است.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'مشاهده همه دسته‌بندی‌ها' })).toHaveAttribute('href', '/categories')
  })

  it('shows an empty hint for a known category without products', async () => {
    renderCategory('power-tools', stubCatalog({ listProducts: vi.fn(async () => emptyResult()) }))

    expect(await screen.findByRole('heading', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(screen.getByText('در این دسته‌بندی هنوز کالایی ثبت نشده است.')).toBeInTheDocument()
  })

  it('shows a Persian error alert when the product request fails', async () => {
    renderCategory('power-tools', stubCatalog({
      listProducts: vi.fn(async () => { throw new Error('down') }),
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری محصولات با خطا مواجه شد.')
  })

  it('keeps the page usable when only the brand lookup fails', async () => {
    renderCategory('power-tools', stubCatalog({
      listBrands: vi.fn(async () => { throw new Error('down') }),
    }))

    // A brand-filter outage must not blank the listing; only the control goes away.
    expect(await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('re-fetches when the slug route parameter changes', async () => {
    const listProducts = vi.fn(async () => result())
    function Harness() {
      const navigate = useNavigate()
      return (
        <div>
          <CatalogProvider api={stubCatalog({ listProducts, listCategories: vi.fn(async () => [CATEGORY]) })}>
            <CategoryPage />
          </CatalogProvider>
          <button onClick={() => navigate('/category/power-tools')}>next</button>
        </div>
      )
    }
    render(
      <MemoryRouter initialEntries={['/category/other']}>
        <Routes>
          <Route path="/category/:slug" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'دسته‌بندی یافت نشد' })

    fireEvent.click(screen.getByText('next'))

    expect(await screen.findByRole('heading', { name: 'ابزار برقی' })).toBeInTheDocument()
    await waitFor(() => {
      const calls = (listProducts.mock.calls as unknown as Array<[Record<string, unknown>]>).map(call => call[0].categorySlug)
      expect(calls).toContain('other')
      expect(calls).toContain('power-tools')
    })
  })

  it('requests the category with paging and the default newest sort', async () => {
    const listProducts = vi.fn(async () => result())
    renderCategory('power-tools', stubCatalog({ listProducts }))

    await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })

    expect(listProducts).toHaveBeenCalledWith(
      expect.objectContaining({ categorySlug: 'power-tools', sortBy: 'newest', page: 1, perPage: 24 }),
    )
  })
})
