import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { CatalogProduct } from '../../services/catalog/types'
import { ProductCard } from './ProductCard'
import { useCart } from '../../state/cart-context'
import { useToast } from '../feedback/toast-context'

vi.mock('../../state/cart-context', async importOriginal => ({ ...(await importOriginal<typeof import('../../state/cart-context')>()), useCart: vi.fn() }))
vi.mock('../feedback/toast-context', () => ({ useToast: vi.fn() }))

function LocationProbe() {
  const { pathname } = useLocation()
  return <span data-testid="path">{pathname}</span>
}

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
    expect(screen.getAllByText('قیمت در دسترس نیست').length).toBeGreaterThan(0)
    expect(screen.queryByText('۰ تومان')).not.toBeInTheDocument()
  })

  it('does not round a valid nonzero integer IRR price down to free', () => {
    const pricedProduct: CatalogProduct = { ...product, priceAvailable: true, price: { amount: '5', currency: 'IRR' } }
    render(<MemoryRouter><ProductCard product={pricedProduct} /></MemoryRouter>)
    expect(screen.getAllByText('۰٫۵ تومان').length).toBeGreaterThan(0)
    expect(screen.queryByText('۰ تومان')).not.toBeInTheDocument()
  })

  it('uses separate product links and no purchase action when the list has no variants', () => {
    render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>)
    const card = screen.getByRole('article')
    expect(within(card).getByRole('link', { name: product.name })).toHaveAttribute('href', '/products/no-price')
    expect(within(card).getByRole('link', { name: 'مشاهده محصول' })).toHaveAttribute('href', '/products/no-price')
    expect(within(card).queryByRole('link', { name: 'خرید سریع' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'افزودن به سبد' })).not.toBeInTheDocument()
    expect(within(card).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('adds a known sellable variant and only then opens the cart for quick purchase', async () => {
    const add = vi.fn(async () => true)
    const show = vi.fn()
    vi.mocked(useCart).mockReturnValue({ state: { phase: 'ready', pendingVariantIds: [] }, add } as unknown as ReturnType<typeof useCart>)
    vi.mocked(useToast).mockReturnValue({ show })
    const withVariant: CatalogProduct = { ...product, priceAvailable: true, stockStatus: 'IN_STOCK', variants: [{ id: 'variant-1', sku: 'sku-1', title: null, price: { amount: '1000', currency: 'IRR' }, attributes: [], stockStatus: 'IN_STOCK' }] }
    render(<MemoryRouter><ProductCard product={withVariant} /><LocationProbe /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'خرید سریع' }))
    await waitFor(() => expect(add).toHaveBeenCalledWith('variant-1', 1))
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/cart'))
    expect(show).toHaveBeenCalledWith('به سبد خرید افزوده شد')
  })

  it('renders the shop price strip and store link without quick purchase controls', () => {
    render(<MemoryRouter><ProductCard product={product} variant="shop" /></MemoryRouter>)
    expect(screen.getByRole('link', { name: `مشاهده ${product.name}` })).toHaveAttribute('href', '/products/no-price')
    expect(screen.queryByRole('link', { name: 'خرید سریع' })).not.toBeInTheDocument()
  })
})
