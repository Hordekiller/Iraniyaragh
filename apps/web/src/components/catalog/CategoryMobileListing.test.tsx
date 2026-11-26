import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CatalogProvider } from '../../state/CatalogProvider'
import type { CatalogApi, CatalogListResult, CatalogProduct } from '../../services/catalog/types'
import { CategoryMobileListing } from './CategoryMobileListing'

const first: CatalogProduct = {
  id: 'first', slug: 'first', name: 'کالای موجود', brand: null, category: null,
  image: '/images/tool1.jpg', media: [], variants: [], description: null,
  price: { amount: '2000', currency: 'IRR' }, priceAvailable: true, oldPrice: null,
  rating: null, reviews: 0, stockStatus: 'IN_STOCK', badge: null,
}
const second: CatalogProduct = {
  ...first, id: 'second', slug: 'second', name: 'کالای ناموجود',
  price: { amount: '1000', currency: 'IRR' }, stockStatus: 'OUT_OF_STOCK',
}
const result: CatalogListResult = { items: [first, second], meta: { page: 1, perPage: 24, total: 2, pages: 1 } }

function setup() {
  const listProducts = vi.fn(async () => result)
  const api = { listProducts } as unknown as CatalogApi
  render(<MemoryRouter><CatalogProvider api={api}><CategoryMobileListing categoryId="category-1" page={1} initialResult={result} /></CatalogProvider></MemoryRouter>)
  return listProducts
}

describe('CategoryMobileListing', () => {
  it('uses current meta for total and filters only fetched unavailable products', () => {
    setup()
    expect(screen.getByText('۲ محصول')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: 'فقط کالاهای موجود' }))
    expect(screen.queryByRole('link', { name: 'کالای ناموجود' })).not.toBeInTheDocument()
    expect(screen.getByText('۱ محصول')).toBeInTheDocument()
    expect(screen.getByText('فیلتر موجودی روی کالاهای همین صفحه اعمال شده است.')).toBeInTheDocument()
  })

  it('requests popular ordering with the existing catalog sort key', async () => {
    const listProducts = setup()
    fireEvent.click(screen.getByRole('button', { name: 'پرفروش‌ترین' }))
    await waitFor(() => expect(listProducts).toHaveBeenCalledWith({ categoryId: 'category-1', page: 1, perPage: 24, sortBy: 'popular' }))
  })

  it('orders the fetched page by integer price without a new API parameter', () => {
    const listProducts = setup()
    fireEvent.click(screen.getByRole('button', { name: 'ارزان‌ترین' }))
    expect(listProducts).not.toHaveBeenCalled()
    const names = screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)
    expect(names).toEqual(['کالای ناموجود', 'کالای موجود'])
    expect(screen.getByText('مرتب‌سازی قیمت روی کالاهای همین صفحه اعمال شده است.')).toBeInTheDocument()
  })
})
