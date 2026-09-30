import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ProductCard } from '../product/ProductCard'
import { ROUTES } from '../../lib/routes'
import type { CatalogProduct } from '../../services/catalog/types'

/**
 * #82 a11y baseline for storefront product cards.
 *
 * This used to assert the invariant against the static prototype showcases
 * (`Bestsellers`, `PopularTools`, `SpecialCollection`). Those components rendered
 * hard-coded products, prices, ratings and stock counts, so they were removed
 * rather than kept as a fixture catalogue in the production runtime. The
 * storefront renders `ProductCard` from API data instead, so the invariant is
 * asserted against the card that actually ships: it must be a real link with an
 * accessible name, and it must never be a click-only generic element.
 */
const product: CatalogProduct = {
  id: 'p-a11y',
  slug: 'a11y-baseline-product',
  name: 'کالای نمونه برای سنجش دسترس‌پذیری',
  brand: null,
  category: null,
  image: '/images/tool1.jpg',
  media: [],
  variants: [],
  description: null,
  price: { amount: '125000000', currency: 'IRR' },
  priceAvailable: true,
  oldPrice: null,
  rating: null,
  reviews: 0,
  stockStatus: 'IN_STOCK',
  badge: null,
}

function withRouter(node: ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>
}

describe('storefront product card › a11y baseline (#82)', () => {
  it('renders the card as a real link with an accessible name', () => {
    render(withRouter(<ProductCard product={product} />))

    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', ROUTES.product(product.slug))
    // The card's accessible name is composed from its contents: the product
    // name (image alt plus heading) followed by price and stock. Asserting the
    // name is present keeps the baseline honest about what a screen reader
    // announces without freezing incidental wording into the test.
    expect(link).toHaveAccessibleName(new RegExp(product.name, 'u'))
    expect(link).toHaveAccessibleName(/موجود/u)
  })

  it('keeps no product card implemented as a click-only generic element', () => {
    const { container } = render(withRouter(<ProductCard product={product} />))

    expect(container.querySelectorAll('div[onclick]').length).toBe(0)
    expect(container.querySelectorAll('span[onclick]').length).toBe(0)
  })
})
