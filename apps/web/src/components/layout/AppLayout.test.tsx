import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AuthFixtureClient } from '../../lib/auth/fixtures'
import { MemorySessionStore } from '../../lib/auth/session-store'
import { AuthProvider } from '../../state/AuthProvider'
import { CartProvider } from '../../state/CartProvider'
import { CatalogProvider } from '../../state/CatalogProvider'
import { CatalogFixtureClient } from '../../services/catalog/fixtures'
import { ToastProvider } from '../../components/feedback/Toast'
import type { CartLine, CartState } from '../../services/cart/types'
import type { CartStorage } from '../../services/cart/controller'
import { AppLayout } from './AppLayout'
import { SITE_NAME } from '../../lib/site-config'

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

const LINE: CartLine = {
  variantId: 'v1',
  productId: 'p1',
  slug: 'ronix-2210-hammer-drill',
  name: 'دریل رونیکس ۲۲۱۰',
  brand: 'Ronix',
  image: '/images/hero1.jpg',
  sku: 'SKU-2210',
  unitPrice: { amount: '28500000', currency: 'IRR' },
  oldPrice: null,
  quantity: 1,
  available: null,
}

function ProductProbe() {
  return <main>outlet-content</main>
}

function renderLayout(storage: CartStorage = new MemoryCartStorage([])) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          element={
            <ToastProvider>
              <AuthProvider api={new AuthFixtureClient({ store: new MemorySessionStore() })}>
                <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
                  <CartProvider storage={storage}>
                    <AppLayout />
                  </CartProvider>
                </CatalogProvider>
              </AuthProvider>
            </ToastProvider>
          }
        >
          <Route path="/" element={<ProductProbe />} />
          <Route path="/search" element={<span data-testid="search-probe">search</span>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppLayout', () => {
  it('renders the shared shell with header, top bar, footer and outlet content', () => {
    renderLayout()

    expect(screen.getAllByText(SITE_NAME).length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByRole('link', { name: 'پیگیری سفارش' }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('outlet-content')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'ناوبری پایین' })).toBeInTheDocument()
  })

  it('shows the cart item count badge from the cart state', () => {
    renderLayout(new MemoryCartStorage([LINE]))

    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'سبد خرید، ۱ کالا' })).toBeInTheDocument()
    // The cart lives in the header only: one control per destination.
    const bottom = screen.getByRole('navigation', { name: 'ناوبری پایین' })
    expect(within(bottom).queryByRole('link', { name: /سبد خرید/ })).not.toBeInTheDocument()
  })

  it('navigates to the search route when a query is submitted from the desktop input', () => {
    renderLayout()

    const input = screen.getByLabelText('جستجو در محصولات')
    fireEvent.change(input, { target: { value: 'دریل' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByTestId('search-probe')).toBeInTheDocument()
  })

  it('toggles the mobile search panel and submits from its input', () => {
    renderLayout()

    fireEvent.click(screen.getAllByRole('button', { name: 'جستجو' })[0])

    const inputs = screen.getAllByLabelText('جستجو در محصولات')
    expect(inputs).toHaveLength(2)
    const mobileInput = inputs[1]
    fireEvent.change(mobileInput, { target: { value: 'bosch' } })
    fireEvent.keyDown(mobileInput, { key: 'Enter' })

    expect(screen.getByTestId('search-probe')).toBeInTheDocument()
  })

  it('opens the login dialog from the account action and closes it with Escape', async () => {
    renderLayout()

    fireEvent.click(screen.getAllByRole('button', { name: 'ورود به حساب کاربری' })[0])

    expect(await screen.findByRole('dialog', { name: 'ورود با شماره موبایل' })).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})