import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../components/feedback/Toast'
import { MemorySessionStore } from '../lib/auth/session-store'
import { CatalogFixtureClient } from '../services/catalog/fixtures'
import { AuthProvider } from '../state/AuthProvider'
import { CartProvider } from '../state/CartProvider'
import { CatalogProvider } from '../state/CatalogProvider'
import {
  CART,
  commerceStub,
  signedInStore,
  testAuthProps,
} from '../test/commerce'
import { ProductPage } from './ProductPage'

function renderPage(store = signedInStore(), commerce = commerceStub()) {
  return render(
    <MemoryRouter initialEntries={['/product/ronix-2210-hammer-drill']}>
      <Routes>
        <Route
          path="/product/:slug"
          element={
            <ToastProvider>
              <AuthProvider {...testAuthProps(store)}>
                <CatalogProvider api={new CatalogFixtureClient({ delayMs: 0 })}>
                  <CartProvider api={commerce}>
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

describe('ProductPage commerce', () => {
  it('adds the selected sellable variant, never the product id', async () => {
    const addLine = vi.fn(async () => await commerceStub().getCart('customer'))
    const api = commerceStub({ addLine })
    renderPage(signedInStore(), api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'افزودن به سبد خرید' }),
    )
    await waitFor(() =>
      expect(addLine).toHaveBeenCalledWith(
        'customer',
        'variant-p-101',
        1,
        expect.stringMatching(/^cart-/),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'به سبد خرید افزوده شد',
    )
  })
  it('adds to the real Guest Cart without forcing early authentication', async () => {
    const api = commerceStub()
    renderPage(new MemorySessionStore(), api)
    fireEvent.click(
      await screen.findByRole('button', { name: 'افزودن به سبد خرید' }),
    )
    await waitFor(() =>
      expect(api.addLine).toHaveBeenCalledWith(
        'guest',
        'variant-p-101',
        1,
        expect.stringMatching(/^cart-/),
      ),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'به سبد خرید افزوده شد',
    )
  })
  it('does not claim success while the server Cart is still initializing', async () => {
    const api = commerceStub({
      getCart: vi.fn(() => new Promise<typeof CART>(() => undefined)),
    })
    renderPage(new MemorySessionStore(), api)

    expect(
      await screen.findByRole('button', { name: 'در حال آماده‌سازی سبد…' }),
    ).toBeDisabled()
    expect(screen.queryByText('به سبد خرید افزوده شد')).not.toBeInTheDocument()
    expect(api.addLine).not.toHaveBeenCalled()
  })
  it('describes shipping honestly', async () => {
    renderPage()
    expect(
      await screen.findByText('هزینه ارسال پس از ثبت آدرس محاسبه می‌شود'),
    ).toBeInTheDocument()
  })
})
