import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogListResult } from '../services/catalog/types'
import { SearchPage } from './SearchPage'

function result(): CatalogListResult {
  return {
    items: [
      {
        id: 'p-101',
        slug: 'ronix-2210-hammer-drill',
        name: 'دریل چکشی رونیکس',
        brand: 'Ronix',
        category: { id: 'cat-power', name: 'ابزار برقی', slug: 'power-tools' },
        image: '/images/hero1.jpg',
        media: [],
        variants: [],
        description: null,
        price: { amount: '28500000', currency: 'IRR' },
        oldPrice: null,
        rating: 4.8,
        reviews: 342,
        stockStatus: 'IN_STOCK',
        badge: null,
      },
    ],
    meta: { page: 1, perPage: 24, total: 1, pages: 1 },
  }
}

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => []),
    listProducts: vi.fn(async () => result()),
    getProductBySlug: vi.fn(async () => { throw new Error('not found') }),
    ...overrides,
  }
}

function renderSearch(query: string | undefined, api: CatalogApi) {
  return render(
    <MemoryRouter initialEntries={[query === undefined ? '/search' : `/search?q=${encodeURIComponent(query)}`]}>
      <Routes>
        <Route
          path="/search"
          element={
            <CatalogProvider api={api}>
              <SearchPage />
            </CatalogProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SearchPage', () => {
  it('asks for a term when the query is empty and never calls the api', () => {
    const api = stubCatalog()
    renderSearch(undefined, api)

    expect(screen.getByRole('heading', { name: /نتایج جستجو/ })).toBeInTheDocument()
    expect(screen.getByText('عبارتی برای جستجو وارد کنید.')).toBeInTheDocument()
    expect(api.listProducts).not.toHaveBeenCalled()
  })

  it('shows the loading state and then the matching products', async () => {
    renderSearch('دریل', stubCatalog())

    expect(await screen.findByText(/برای «دریل»/)).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })).toBeInTheDocument()
    expect(screen.getByText('۱ کالا یافت شد')).toBeInTheDocument()
  })

  it('shows the product count from the returned items, not the pagination total', async () => {
    renderSearch('bosch', stubCatalog({ listProducts: vi.fn(async () => ({
      items: result().items,
      meta: { page: 1, perPage: 24, total: 3, pages: 1 },
    })) }))

    expect(await screen.findByText('۱ کالا یافت شد')).toBeInTheDocument()
  })

  it('shows an empty-result hint when nothing matches', async () => {
    renderSearch(
      'banana',
      stubCatalog({ listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })) }),
    )

    expect(await screen.findByText(/هیچ محصولی برای «banana» پیدا نشد\./)).toBeInTheDocument()
  })

  it('shows a Persian error alert when the search fails', async () => {
    renderSearch('دریل', stubCatalog({
      listProducts: vi.fn(async () => { throw new Error('down') }),
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت نتایج جستجو با خطا مواجه شد. لطفاً دوباره تلاش کنید.')
  })

  it('re-runs the search when the query parameter changes', async () => {
    const listProducts = vi.fn(async () => result())
    function Harness() {
      const navigate = useNavigate()
      return (
        <div>
          <CatalogProvider api={stubCatalog({ listProducts })}>
            <SearchPage />
          </CatalogProvider>
          <button onClick={() => navigate('/search?q=two')}>next</button>
        </div>
      )
    }
    render(
      <MemoryRouter initialEntries={['/search?q=one']}>
        <Routes>
          <Route path="/search" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })

    fireEvent.click(screen.getByText('next'))

    expect(await screen.findByText(/برای «two»/)).toBeInTheDocument()
    expect(listProducts.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect((listProducts.mock.calls as unknown as Array<[Record<string, string>]>)[1][0]).toEqual({ search: 'two' })
  })
})
