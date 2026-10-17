import { fireEvent, render, screen, within } from '@testing-library/react'
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
    renderHome(catalogApi())

    expect(screen.getByRole('status')).toHaveTextContent('در حال دریافت کاتالوگ')
    expect(await screen.findByRole('link', { name: 'یراق کابینت' })).toHaveAttribute('href', '/category/cabinet')
    expect(screen.getByRole('link', { name: /کالای منتشرشده/ })).toHaveAttribute('href', '/product/published-product')
    expect(screen.getByRole('heading', { name: 'خبرنامه هنوز فعال نیست' })).toBeInTheDocument()
    expect(screen.queryByText('۲۵۰۰')).not.toBeInTheDocument()
  })

  it('shows only 13 roots when the API also returns 76 descendants', async () => {
    const roots: CatalogCategory[] = Array.from({ length: 13 }, (_, index) => ({
      id: `root-${index}`, parentId: null, name: `دسته اصلی ${index}`, slug: `root-${index}`, productCount: 0, image: '',
    }))
    const descendants: CatalogCategory[] = Array.from({ length: 76 }, (_, index) => ({
      id: `child-${index}`, parentId: roots[index % roots.length].id, name: `زیردسته ${index}`, slug: `child-${index}`, productCount: 0, image: '',
    }))
    renderHome(catalogApi({ listCategories: vi.fn(async () => [...descendants, ...roots]) }))

    const section = await screen.findByRole('region', { name: 'دسته‌بندی کالاها' })
    expect(await within(section).findAllByRole('link')).toHaveLength(13)
    expect(within(section).queryByRole('link', { name: /زیردسته/ })).not.toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'دسته اصلی 0' })).toHaveAttribute('href', '/category/root-0')
  })

  it('does not fall back to fixture products when the API fails and retries explicitly', async () => {
    const listProducts = vi.fn()
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce({ items: [PRODUCT], meta: { page: 1, perPage: 24, total: 1, pages: 1 } })
    renderHome(catalogApi({ listProducts }))

    expect(await screen.findByRole('alert')).toHaveTextContent('قیمت یا موجودی نمونه نمایش داده نمی‌شود')
    expect(screen.queryByRole('link', { name: /کالای منتشرشده/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('link', { name: /کالای منتشرشده/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenCalledTimes(2)
  })

  it('fetches newest products again when returning from publishing in another tab', async () => {
    const listProducts = vi.fn()
      .mockResolvedValueOnce({ items: [], meta: { page: 1, perPage: 100, total: 0, pages: 0 } })
      .mockResolvedValue({ items: [PRODUCT], meta: { page: 1, perPage: 100, total: 1, pages: 1 } })
    renderHome(catalogApi({ listProducts }))
    await screen.findByText('در حال حاضر کالای منتشرشده‌ای برای نمایش وجود ندارد.')
    fireEvent.focus(window)
    expect(await screen.findByRole('link', { name: /کالای منتشرشده/ })).toBeInTheDocument()
    expect(listProducts).toHaveBeenLastCalledWith({ sortBy: 'newest' })
  })
})
