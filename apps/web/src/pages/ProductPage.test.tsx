import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { MemorySessionStore } from '../lib/auth/session-store'
import { AuthFixtureClient } from '../lib/auth/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CatalogProvider } from '../state/CatalogProvider'
import { ToastProvider } from '../components/feedback/Toast'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import type { CartLine, CartState } from '../services/cart/types'
import type { CartStorage } from '../services/cart/controller'
import type { CatalogApi, CatalogProduct } from '../services/catalog/types'
import { ProductPage } from './ProductPage'

class MemoryCartStorage implements CartStorage {
  state: CartState
  constructor(lines: CartLine[] = []) {
    this.state = { lines: lines.map(line => ({ ...line })) }
  }
  read(): CartState {
    return { lines: this.state.lines.map(line => ({ ...line })) }
  }
  write(next: CartState): void {
    this.state = { lines: next.lines.map(line => ({ ...line })) }
  }
}

const cartLineFor = (product: CatalogProduct): CartLine => ({
  productId: product.id,
  slug: product.slug,
  name: product.name,
  brand: product.brand,
  image: product.image,
  unitPrice: product.price,
  oldPrice: product.oldPrice,
  quantity: 1,
})

function stubCatalog(overrides: Partial<CatalogApi> = {}): CatalogApi {
  return {
    listCategories: vi.fn(async () => []),
    listProducts: vi.fn(async () => ({ items: [], meta: { page: 1, perPage: 24, total: 0, pages: 0 } })),
    getProductBySlug: vi.fn(async () => new CatalogFixtureClient({ delayMs: 0 }).getProductBySlug('ronix-2210-hammer-drill')),
    ...overrides,
  }
}

function renderProduct(slug: string, api: CatalogApi, storage: CartStorage = new MemoryCartStorage([])) {
  return render(
    <MemoryRouter initialEntries={[`/product/${slug}`]}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
                <CatalogProvider api={api}>
                  <CartProvider storage={storage}>
                    <ProductPage />
                  </CartProvider>
                </CatalogProvider>
              </AuthProvider>
            </ToastProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProductPage', () => {
  it('renders the catalog product with its Persian data', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    expect(screen.getByText('در حال بارگذاری...')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })).toBeInTheDocument()
    expect(screen.getByText('Ronix')).toBeInTheDocument()
    expect(screen.getByText('موجود در انبار')).toBeInTheDocument()
    expect(screen.getByText('پرفروش هفته')).toBeInTheDocument()
    expect(screen.getByText('۲٬۸۵۰٬۰۰۰ تومان')).toBeInTheDocument()
    expect(screen.getByText('۴.۸')).toBeInTheDocument()
    expect(screen.getByText('(۳۴۲ نظر)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ابزار برقی/ })).toHaveAttribute('href', '/category/power-tools')
  })

  it('shows the not-found screen when the product is missing', async () => {
    const api = stubCatalog({
      getProductBySlug: vi.fn(async () => { throw new Error('missing') }),
    })
    renderProduct('does-not-exist', api)

    expect(await screen.findByRole('heading', { name: 'محصول یافت نشد' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت به فروشگاه' })).toHaveAttribute('href', '/')
  })

  it('adds the product to the cart from a fresh state and shows a toast', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const storage = new MemoryCartStorage([])
    renderProduct('bosch-gws-750-grinder', api, storage)

    fireEvent.click(await screen.findByRole('button', { name: 'افزودن به سبد خرید' }))

    expect(storage.state.lines).toHaveLength(1)
    expect(storage.state.lines[0].productId).toBe('p-102')
    expect(await screen.findByRole('status')).toHaveTextContent('به سبد خرید افزوده شد')
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeInTheDocument()
  })

  it('renders a quantity stepper for a product already in the cart', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const product = await api.getProductBySlug('ronix-2210-hammer-drill')
    const storage = new MemoryCartStorage([cartLineFor(product)])
    renderProduct(product.slug, api, storage)

    await screen.findByRole('heading', { name: product.name })

    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeInTheDocument()
    expect(screen.getByLabelText('۱')).toBeInTheDocument()
  })

  it('adjusts the quantity from the stepper', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const product = await api.getProductBySlug('ronix-2210-hammer-drill')
    const storage = new MemoryCartStorage([cartLineFor(product)])
    renderProduct(product.slug, api, storage)

    await screen.findByRole('heading', { name: product.name })

    fireEvent.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    expect(storage.state.lines[0].quantity).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'کاهش تعداد' }))
    expect(storage.state.lines[0].quantity).toBe(1)
  })

  it('shows the free-shipping badge for an over-threshold product', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2701-multitool', api)

    expect(await screen.findByText('ارسال رایگان')).toBeInTheDocument()
  })

  it('displays the flat shipping cost for an under-threshold product', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('hans-24pc-socket-set', api)

    expect(await screen.findByText('ارسال ۴۵٬۰۰۰ تومان')).toBeInTheDocument()
  })

  it('shows the discount badge and percentage when an old price exists', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    expect(screen.getByText(/٪۱۷ تخفیف/)).toBeInTheDocument()
  })

  it('disables the add button for an out-of-stock product', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    const storage = new MemoryCartStorage([])
    renderProduct('dewalt-20v-chainsaw', api, storage)

    const addButton = await screen.findByRole('button', { name: 'ناموجود' })
    expect(addButton).toBeDisabled()
    expect(screen.getAllByText('ناموجود').length).toBeGreaterThanOrEqual(2)

    fireEvent.click(addButton)
    expect(storage.state.lines).toHaveLength(0)
  })

  it('navigates to the cart page from the side action', async () => {
    const api = new CatalogFixtureClient({ delayMs: 0 })
    renderProduct('ronix-2210-hammer-drill', api)

    await screen.findByRole('heading', { name: 'دریل چکشی ۱۳ میلی‌متر رونیکس ۲۲۱۰' })

    expect(screen.getByRole('button', { name: 'مشاهده سبد' })).toBeInTheDocument()
  })
})