import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../feedback/Toast'
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
  render(<MemoryRouter><ToastProvider><CatalogProvider api={api}><CategoryMobileListing categoryId="category-1" page={1} initialResult={result} /></CatalogProvider></ToastProvider></MemoryRouter>)
  return listProducts
}

describe('CategoryMobileListing', () => {
  it('renders the server order and total without a second page-local filter', () => {
    const request = setup()
    expect(screen.getByText('۲ کالا')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).map(item => item.textContent)).toEqual(['کالای موجود', 'کالای ناموجود'])
    expect(request).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
})
