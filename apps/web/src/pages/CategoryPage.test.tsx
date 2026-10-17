import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogCategory, CatalogListResult } from '../services/catalog/types'
import { CategoryPage } from './CategoryPage'

const CATEGORY: CatalogCategory = {
  id: 'cat-power',
  parentId: null,
  name: 'ابزار برقی',
  slug: 'power-tools',
  productCount: 320,
  image: '/images/hero1.jpg',
}

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
    listCategories: vi.fn(async () => [CATEGORY]),
    listProducts: vi.fn(async () => result()),
    getProductBySlug: vi.fn(async () => { throw new Error('not found') }),
    ...overrides,
  }
}

function renderCategory(slug: string, api: CatalogApi) {
  return render(
    <MemoryRouter initialEntries={[`/category/${slug}`]}>
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

    expect(screen.getByText('در حال بارگذاری...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /دریل چکشی رونیکس/ })).toBeInTheDocument()
    expect(screen.getByText('۱ کالا')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'خانه' })).toHaveAttribute('href', '/')
  })

  it('falls back to a generic title and empty hint for an unknown category', async () => {
    renderCategory('nope', stubCatalog({ listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })) }))

    expect(await screen.findByRole('heading', { name: 'دسته‌بندی' })).toBeInTheDocument()
    expect(screen.getByText('هیچ محصولی در این دسته‌بندی موجود نیست.')).toBeInTheDocument()
  })

  it('shows an empty hint for a known category without products', async () => {
    renderCategory('power-tools', stubCatalog({ listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })) }))

    expect(await screen.findByRole('heading', { name: 'ابزار برقی' })).toBeInTheDocument()
    expect(screen.getByText('هیچ محصولی در این دسته‌بندی موجود نیست.')).toBeInTheDocument()
  })

  it('shows a Persian error alert when the category request fails', async () => {
    renderCategory('power-tools', stubCatalog({
      listCategories: vi.fn(async () => { throw new Error('down') }),
    }))

    expect(await screen.findByRole('alert')).toHaveTextContent('دریافت دسته‌بندی با خطا مواجه شد.')
  })

  it('drills through four levels one at a time and navigates back through ancestors', async () => {
    const child = { ...CATEGORY, id: 'child', parentId: CATEGORY.id, name: 'ابزار سوراخ‌کاری', slug: 'drilling' }
    const grandchild = { ...CATEGORY, id: 'grandchild', parentId: child.id, name: 'دریل', slug: 'drills' }
    const leaf = { ...CATEGORY, id: 'leaf', parentId: grandchild.id, name: 'دریل چکشی', slug: 'hammer-drills' }
    const sibling = { ...CATEGORY, id: 'sibling', parentId: CATEGORY.id, name: 'ابزار برش', slug: 'cutting' }
    const otherRoot = { ...CATEGORY, id: 'other-root', name: 'ایمنی', slug: 'safety' }
    const api = stubCatalog({
      listCategories: vi.fn(async () => [leaf, sibling, grandchild, otherRoot, child, CATEGORY]),
      listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
    })
    renderCategory(CATEGORY.slug, api)

    const children = await screen.findByRole('region', { name: 'زیردسته‌های ابزار برقی' })
    expect(within(children).getAllByRole('link')).toHaveLength(2)
    expect(within(children).queryByRole('link', { name: grandchild.name })).not.toBeInTheDocument()
    expect(within(children).queryByRole('link', { name: leaf.name })).not.toBeInTheDocument()
    expect(within(children).queryByRole('link', { name: otherRoot.name })).not.toBeInTheDocument()
    fireEvent.click(within(children).getByRole('link', { name: child.name }))

    const grandchildren = await screen.findByRole('region', { name: `زیردسته‌های ${child.name}` })
    expect(within(grandchildren).getAllByRole('link')).toHaveLength(1)
    fireEvent.click(within(grandchildren).getByRole('link', { name: grandchild.name }))
    const leaves = await screen.findByRole('region', { name: `زیردسته‌های ${grandchild.name}` })
    fireEvent.click(within(leaves).getByRole('link', { name: leaf.name }))

    await screen.findByRole('heading', { name: leaf.name })
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
    const breadcrumb = screen.getByRole('navigation', { name: 'مسیر دسته‌بندی' })
    expect(within(breadcrumb).getAllByRole('link').map(link => link.textContent)).toEqual(['خانه', CATEGORY.name, child.name, grandchild.name])
    expect(within(breadcrumb).getByText(leaf.name)).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(breadcrumb).getByRole('link', { name: CATEGORY.name }))
    expect(await screen.findByRole('region', { name: 'زیردسته‌های ابزار برقی' })).toBeInTheDocument()
    expect(api.listProducts).toHaveBeenLastCalledWith({ categorySlug: CATEGORY.slug })
  })

  it('restores ancestor links on a direct nested category visit', async () => {
    const child = { ...CATEGORY, id: 'child', parentId: CATEGORY.id, name: 'دریل', slug: 'drills' }
    const leaf = { ...CATEGORY, id: 'leaf', parentId: child.id, name: 'دریل شارژی', slug: 'cordless' }
    renderCategory(leaf.slug, stubCatalog({ listCategories: vi.fn(async () => [leaf, CATEGORY, child]) }))

    await screen.findByRole('heading', { name: leaf.name })
    const breadcrumb = screen.getByRole('navigation', { name: 'مسیر دسته‌بندی' })
    expect(within(breadcrumb).getByRole('link', { name: CATEGORY.name })).toHaveAttribute('href', '/category/power-tools')
    expect(within(breadcrumb).getByRole('link', { name: child.name })).toHaveAttribute('href', '/category/drills')
    expect(screen.getByRole('link', { name: /دریل چکشی رونیکس/ })).toBeInTheDocument()
  })

  it('re-fetches when the slug route parameter changes', async () => {
    const listProducts = vi.fn(async () => result())
    function Harness() {
      const navigate = useNavigate()
      return (
        <div>
          <CatalogProvider api={stubCatalog({ listProducts })}>
            <CategoryPage />
          </CatalogProvider>
          <button onClick={() => navigate('/category/hand-tools')}>next</button>
        </div>
      )
    }
    render(
      <MemoryRouter initialEntries={['/category/power-tools']}>
        <Routes>
          <Route path="/category/:slug" element={<Harness />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: 'ابزار برقی' })

    fireEvent.click(screen.getByText('next'))

    expect(await screen.findByRole('heading', { name: /^دسته/ })).toBeInTheDocument()
    expect(listProducts.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect((listProducts.mock.calls as unknown as Array<[Record<string, string>]>)[1][0]).toEqual({ categorySlug: 'hand-tools' })
  })
})
