import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogCategory, CatalogProduct } from '../services/catalog/types'
import { HomePage } from './HomePage'

const PRODUCT: CatalogProduct = {
  id: 'product-1',
  slug: 'published-product',
  name: 'کالای منتشرشده',
  brand: null,
  category: { id: 'category-1', name: 'یراق کابینت', slug: 'cabinet' },
  image: '/images/tool2.jpg',
  media: [],
  variants: [],
  axes: [],
  description: null,
  price: { amount: '1000000', currency: 'IRR' },
  oldPrice: null,
  rating: null,
  reviews: 0,
  stockStatus: 'UNKNOWN',
  badge: null,
}

function catalogApi(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => [{ id: 'category-1', parentId: null, name: 'یراق کابینت', slug: 'cabinet', productCount: 1, image: '' }]),
    getHomepageCollections: vi.fn(async () => ({ version: 1, updatedAt: null, sections: [{ categoryId: 'category-1', sortBy: 'NEWEST' as const }] })),
    listProducts: vi.fn(async () => ({ items: [PRODUCT], meta: { page: 1, perPage: 24, total: 1, pages: 1 } })),
    getProductBySlug: vi.fn(async () => PRODUCT),
    ...overrides,
  }
}

function renderHome(api: CatalogApi) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <CatalogProvider api={api}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/category/:slug" element={<span>صفحه دسته</span>} />
          <Route path="/product/:slug" element={<span>صفحه محصول</span>} />
        </Routes>
      </CatalogProvider>
    </MemoryRouter>,
  )
}

describe('HomePage', () => {
  it('renders only products and categories received from the catalog API', async () => {
    const listProducts = vi.fn(async () => ({ items: [PRODUCT], meta: { page: 1, perPage: 8, total: 1, pages: 1 } }))
    renderHome(catalogApi({ listProducts }))

    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت کاتالوگ')
    expect(await screen.findByRole('link', { name: 'یراق کابینت' })).toHaveAttribute('href', '/category/cabinet')
    expect(screen.getAllByRole('link', { name: /کالای منتشرشده/ })[0]).toHaveAttribute('href', '/product/published-product')
    expect(screen.getByRole('region', { name: 'جدیدترین یراق کابینت' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'کالاهای بعدی در جدیدترین یراق کابینت' })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith({ categoryId: 'category-1', sortBy: 'newest', perPage: 8 })
    expect(screen.getByRole('heading', { name: 'خبرنامه هنوز فعال نیست' })).toBeInTheDocument()
    expect(screen.queryByText('۲۵۰۰')).not.toBeInTheDocument()
  })

  it('shows exactly the five configured parent categories and excludes descendants', async () => {
    const roots: CatalogCategory[] = Array.from({ length: 13 }, (_, index) => ({
      id: `root-${index}`, parentId: null, name: `دسته اصلی ${index}`, slug: `root-${index}`, productCount: 0, image: '',
    }))
    const descendants: CatalogCategory[] = Array.from({ length: 76 }, (_, index) => ({
      id: `child-${index}`, parentId: roots[index % roots.length].id, name: `زیردسته ${index}`, slug: `child-${index}`, productCount: 0, image: '',
    }))
    const sections = roots.slice(0, 5).map((category, index) => ({ categoryId: category.id, sortBy: index === 0 ? 'BESTSELLING' as const : 'NEWEST' as const }))
    renderHome(catalogApi({ listCategories: vi.fn(async () => [...descendants, ...roots]), getHomepageCollections: vi.fn(async () => ({ version: 2, updatedAt: null, sections })) }))

    const section = await screen.findByRole('region', { name: 'دسته‌بندی کالاها' })
    expect(await within(section).findAllByRole('link')).toHaveLength(5)
    expect(within(section).queryByRole('link', { name: /زیردسته/ })).not.toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'دسته اصلی 0' })).toHaveAttribute('href', '/category/root-0')
  })

  it('keeps all five configured carousel sections visible when their products are still drafts', async () => {
    const roots: CatalogCategory[] = Array.from({ length: 5 }, (_, index) => ({ id: `root-${index}`, parentId: null, name: `دسته ${index}`, slug: `root-${index}`, productCount: 0, image: '' }))
    const sections = roots.map(category => ({ categoryId: category.id, sortBy: 'NEWEST' as const }))
    renderHome(catalogApi({
      listCategories: vi.fn(async () => roots),
      getHomepageCollections: vi.fn(async () => ({ version: 1, updatedAt: null, sections })),
      listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 8, total: 0, pages: 0 } })),
    }))
    expect(await screen.findByRole('region', { name: 'جدیدترین دسته 4' })).toBeInTheDocument()
    expect(screen.getAllByText(/هنوز محصول منتشرشده‌ای در این دسته نیست/)).toHaveLength(5)
  })

  it('does not fall back to fixture products when the API fails and retries explicitly', async () => {
    const listProducts = vi.fn()
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValue({ items: [PRODUCT], meta: { page: 1, perPage: 8, total: 1, pages: 1 } })
    renderHome(catalogApi({ listProducts }))

    expect(await screen.findByRole('alert')).toHaveTextContent('بخشی از اطلاعات فروشگاه دریافت نشد')
    expect(screen.getByText('کالاهای این دسته فعلاً دریافت نشدند.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'محصولات یراق کابینت' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(2))
    expect(await screen.findAllByRole('link', { name: /کالای منتشرشده/ })).toHaveLength(1)
  })

  it('refreshes configured category products when returning from publishing in another tab', async () => {
    const listProducts = vi.fn()
      .mockResolvedValueOnce({ items: [], meta: { page: 1, perPage: 8, total: 0, pages: 0 } })
      .mockResolvedValue({ items: [PRODUCT], meta: { page: 1, perPage: 8, total: 1, pages: 1 } })
    renderHome(catalogApi({ listProducts }))
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(1))
    fireEvent.focus(window)
    expect(await screen.findByRole('link', { name: /کالای منتشرشده/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith({ categoryId: 'category-1', sortBy: 'newest', perPage: 8 })
  })

  it('uses the configured bestseller order and never guesses homepage categories', async () => {
    const listProducts = vi.fn(async () => ({ items: [PRODUCT], meta: { page: 1, perPage: 8, total: 1, pages: 1 } }))
    renderHome(catalogApi({
      getHomepageCollections: vi.fn(async () => ({ version: 2, updatedAt: null, sections: [{ categoryId: 'category-1', sortBy: 'BESTSELLING' as const }] })),
      listProducts,
    }))
    expect(await screen.findByRole('region', { name: 'پرفروش‌های یراق کابینت' })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledWith({ categoryId: 'category-1', sortBy: 'popular', perPage: 8 })
    expect(screen.queryByRole('region', { name: 'تازه‌ترین کالاها' })).not.toBeInTheDocument()
  })
})
