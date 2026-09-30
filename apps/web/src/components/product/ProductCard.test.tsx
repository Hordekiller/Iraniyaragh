import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from '../../services/catalog/types'
import { ProductCard } from './ProductCard'

const product: CatalogProduct = {
  id: 'p-1', slug: 'no-price', name: 'کالای بدون قیمت', brand: null,
  category: null, image: '/images/tool1.jpg', media: [], variants: [],
  description: null, price: { amount: '0', currency: 'IRR' },
  priceAvailable: false, oldPrice: null, rating: null, reviews: 0,
  stockStatus: 'UNKNOWN', badge: null,
}

describe('ProductCard', () => {
  it('does not present an omitted API price as a free product', () => {
    render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    expect(screen.getByText('قیمت در دسترس نیست')).toBeInTheDocument()
    expect(screen.queryByText('۰ تومان')).not.toBeInTheDocument()
  })
})
