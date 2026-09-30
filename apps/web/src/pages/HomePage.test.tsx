import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../state/CatalogProvider'
import type { CatalogApi, CatalogProduct } from '../services/catalog/types'
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
    listCategories: vi.fn(async () => [{ id: 'category-1', name: 'یراق کابینت', slug: 'cabinet', productCount: 1, image: '' }]),
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
})
